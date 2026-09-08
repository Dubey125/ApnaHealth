import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { nanoid } from "nanoid";
import { getPage, prisma, requireServer } from "./helpers";
import { entitlementsFor } from "../../src/lib/billing/entitlements";
import { loadClinicBilling } from "../../src/lib/billing/load";
import { addDays } from "../../src/lib/billing/subscription";

// Billing enforcement, verified where it would do real damage.
//
// The unit tests prove the entitlement rules. What they cannot prove is
// that the rules are actually wired into the app, that a suspended clinic
// still disappears from nothing a patient depends on, and — the one that
// matters — that a patient already holding a token can still be seen when
// their clinic has not paid.

let clinicId: string;
let sessionId: string;
let tokenPublicId: string;
let subscriptionId: string;
let originalStatus: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";

before(async () => {
  await requireServer();

  const doctor = await prisma.doctor.findFirstOrThrow({
    where: { isActive: true, clinic: { isActive: true, approvalStatus: "APPROVED" } },
  });
  clinicId = doctor.clinicId;

  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { clinicId } });
  subscriptionId = subscription.id;
  originalStatus = subscription.status;

  const now = new Date();
  const created = await prisma.session.create({
    data: {
      clinicId,
      doctorId: doctor.id,
      publicId: nanoid(),
      sessionDate: now,
      plannedStartAt: now,
      plannedEndAt: new Date(now.getTime() + 3 * 60 * 60 * 1000),
      locationLabel: "Billing test room",
      status: "IN_PROGRESS",
      actualStartAt: now,
    },
  });
  sessionId = created.id;

  const token = await prisma.token.create({
    data: {
      sessionId,
      publicId: nanoid(),
      tokenNumber: 1,
      patientNameSnapshot: "Billing Test",
      patientPhoneSnapshot: "+919500000001",
      source: "WALK_IN",
      status: "CHECKED_IN",
      issuedAt: now,
      checkedInAt: now,
    },
  });
  tokenPublicId = token.publicId;
});

after(async () => {
  if (subscriptionId) {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: originalStatus, gracePeriodEndsAt: null, trialEndsAt: null },
    });
    await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId } });
  }
  if (sessionId) {
    const ids = (await prisma.token.findMany({ where: { sessionId }, select: { id: true } })).map((t) => t.id);
    await prisma.predictionSnapshot.deleteMany({ where: { tokenId: { in: ids } } });
    await prisma.queueEvent.deleteMany({ where: { sessionId } });
    await prisma.token.deleteMany({ where: { sessionId } });
    await prisma.session.delete({ where: { id: sessionId } });
  }
});

async function setStatus(status: typeof originalStatus): Promise<void> {
  await prisma.subscription.update({ where: { id: subscriptionId }, data: { status } });
}

test("a patient's own ticket page works while the clinic is suspended", async () => {
  // THE test. A patient holding a token is not party to their clinic's
  // commercial relationship, and must never be the leverage in it. If
  // this fails, an unpaid invoice has reached a waiting room.
  await setStatus("SUSPENDED");
  const page = await getPage(`/t/${tokenPublicId}`);
  assert.equal(page.status, 200, "a suspended clinic must not break a patient's ticket");
  assert.ok(page.body.includes("Billing Test"), "the patient should still see their own token");
});

test("the ticket page never mentions the clinic's billing status", async () => {
  // A patient does not need to know their doctor missed a payment, and
  // telling them would leak a commercial fact into a public page.
  await setStatus("SUSPENDED");
  const page = await getPage(`/t/${tokenPublicId}`);
  const visible = page.body.replace(/<script[\s\S]*?<\/script>/g, "");
  for (const leak of ["SUSPENDED", "subscription", "Subscription", "billing", "unpaid"]) {
    assert.ok(!visible.includes(leak), `"${leak}" must not appear on a patient's ticket`);
  }
});

test("entitlements resolved through the real loader match the rules", async () => {
  for (const status of ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const) {
    await setStatus(status);
    const billing = await loadClinicBilling(clinicId);
    assert.deepEqual(
      billing.entitlements,
      entitlementsFor(status),
      `loader disagreed with the rules for ${status}`,
    );
    assert.equal(billing.entitlements.canOperateExistingQueue, true, `${status} broke the existing queue`);
  }
});

test("a failed payment leaves the clinic fully operational", async () => {
  await setStatus("PAST_DUE");
  const billing = await loadClinicBilling(clinicId);
  assert.equal(billing.entitlements.canIssueTokens, true, "a card that expired must not stop an OPD");
  assert.equal(billing.entitlements.canScheduleNewWork, true);
  assert.equal(billing.entitlements.notice, "payment_failed", "but the owner is told");
});

test("an expired grace period suspends on read, and records that the clock did it", async () => {
  // There is no scheduler in this stack, so the clock is applied when the
  // row is read. If that did not work, a lapsed clinic would stay
  // entitled forever.
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: "PAST_DUE", gracePeriodEndsAt: addDays(new Date(), -1) },
  });

  const billing = await loadClinicBilling(clinicId);
  assert.equal(billing.subscription?.status, "SUSPENDED");
  assert.equal(billing.entitlements.canIssueTokens, false);
  assert.equal(billing.entitlements.canOperateExistingQueue, true);

  const event = await prisma.subscriptionEvent.findFirstOrThrow({
    where: { subscriptionId },
    orderBy: { occurredAt: "desc" },
  });
  assert.equal(event.toStatus, "SUSPENDED");
  assert.equal(event.actorAdminId, null, "the clock is not a person and must not be recorded as one");
});

test("public discovery is unaffected by a clinic's commercial state", async () => {
  // Delisting an unpaid clinic from search would punish patients looking
  // for a doctor who is still practising, and would make the directory
  // less truthful about the world.
  await setStatus("SUSPENDED");
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { slug: true } });
  const page = await getPage(`/facilities/${clinic.slug}`);
  assert.equal(page.status, 200, "a suspended clinic is still a real clinic");
});

test("every clinic has a subscription, so nothing depends on the fail-open path", async () => {
  const [clinics, subscriptions] = await Promise.all([prisma.clinic.count(), prisma.subscription.count()]);
  assert.equal(subscriptions, clinics, "the backfill should cover every clinic");
});

test("no clinic was left instantly over its seat allowance", async () => {
  // The backfill sets seats from the current doctor count. A clinic that
  // woke up over its limit would be blocked from adding doctors on day
  // one, for a plan it never chose.
  const subscriptions = await prisma.subscription.findMany({
    include: { clinic: { select: { _count: { select: { doctors: true } } } } },
  });
  for (const subscription of subscriptions) {
    assert.ok(
      subscription.clinic._count.doctors <= subscription.doctorSeats,
      "a pre-existing clinic must not start over its seat limit",
    );
  }
});
