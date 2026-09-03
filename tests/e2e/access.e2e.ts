import { before, test } from "node:test";
import assert from "node:assert/strict";
import { getPage, getStatus, patientCookie, prisma, requireServer } from "./helpers";

// The security boundary, asserted over HTTP.
//
// Every one of these is a rule stated in CLAUDE.md or PRIVACY_BOUNDARY.md:
// staff and admin consoles are gated, one patient never sees another's
// data, and a facility that has not cleared review is not listed anywhere.

before(async () => {
  await requireServer();
});

test("staff, admin and patient areas redirect a signed-out visitor", async () => {
  for (const path of [
    "/app",
    "/app/clinic",
    "/app/analytics",
    "/app/queue/anything",
    "/admin",
    "/admin/facilities",
    "/patient/appointments",
    "/patient/records",
    "/patient/account",
  ]) {
    const status = await getStatus(path);
    assert.equal(status, 307, `${path} should redirect a signed-out visitor, got ${status}`);
  }
});

test("a patient session opens the patient area and nothing else", async () => {
  const cookie = await patientCookie();
  const headers = { cookie };

  for (const path of ["/patient/appointments", "/patient/records", "/patient/account"]) {
    assert.equal((await getPage(path, { headers })).status, 200, `${path} should open for a patient`);
  }

  // A patient cookie is not a staff or admin cookie: the proxy checks a
  // different cookie name entirely, so this can never be satisfied by
  // escalating a patient session.
  for (const path of ["/app", "/admin"]) {
    assert.equal((await getPage(path, { headers })).status, 307, `${path} must stay closed to a patient`);
  }
});

test("a patient sees only their own appointments", async () => {
  const cookie = await patientCookie();
  const page = await getPage("/patient/appointments", { headers: { cookie } });

  const patient = await prisma.patient.findUniqueOrThrow({ where: { phone: "9000000006" } });
  const ownTokens = await prisma.token.findMany({
    where: { patientId: patient.id },
    select: { publicId: true },
  });
  const otherTokens = await prisma.token.findMany({
    where: { patientId: { not: patient.id } },
    select: { publicId: true },
    take: 20,
  });

  assert.ok(ownTokens.length > 0, "the seeded patient should have appointments");
  for (const token of ownTokens) {
    assert.ok(page.body.includes(token.publicId), `own appointment ${token.publicId} should be listed`);
  }
  for (const token of otherTokens) {
    assert.ok(!page.body.includes(token.publicId), `LEAK: someone else's token ${token.publicId} was rendered`);
  }
});

// A facility awaiting review, or rejected, or switched off, has rows in the
// database but must be invisible everywhere public.
test("an unapproved facility is absent from search and 404s by URL", async () => {
  const unlisted = await prisma.clinic.findFirst({
    where: { OR: [{ approvalStatus: { not: "APPROVED" } }, { isActive: false }] },
    select: { slug: true, name: true },
  });
  if (!unlisted) {
    // Nothing to assert against in this database; the where-clause contract
    // is separately covered by src/lib/publicListing.test.ts.
    return;
  }

  assert.equal(await getStatus(`/facilities/${unlisted.slug}`), 404, "an unlisted facility must 404");

  for (const path of ["/doctors", "/clinics", "/hospitals"]) {
    const page = await getPage(path);
    assert.ok(!page.body.includes(unlisted.name), `${unlisted.name} must not appear on ${path}`);
    assert.ok(!page.body.includes(unlisted.slug), `${unlisted.slug} must not be linked from ${path}`);
  }
});

test("a ticket page is reachable by its public id and never by an internal one", async () => {
  const token = await prisma.token.findFirst({ select: { id: true, publicId: true } });
  assert.ok(token, "expected a seeded token");
  assert.equal(await getStatus(`/t/${token.publicId}`), 200, "the public id should open the ticket");
  assert.equal(await getStatus(`/t/${token.id}`), 404, "an internal id must never resolve");
});

test("a bad slug or id 404s rather than soft-404ing with a 200", async () => {
  // The regression this exists for: adding loading.tsx made these routes
  // stream, which committed a 200 before notFound() could set the status —
  // so the 404 page rendered under a 200 and search engines indexed it.
  // See docs/product/LOADING_STATES.md.
  for (const path of [
    "/doctors/no-such-doctor",
    "/facilities/no-such-facility",
    "/t/no-such-ticket",
    "/book/no-such-session",
    "/definitely-not-a-page",
  ]) {
    assert.equal(await getStatus(path), 404, `${path} must return a real 404`);
  }
});

test("the 404 page offers a route back into discovery", async () => {
  const page = await getPage("/doctors/no-such-doctor");
  assert.equal(page.status, 404);
  assert.ok(page.body.includes("/doctors"), "a 404 should not be a dead end");
});

test("private pages are marked noindex", async () => {
  const cookie = await patientCookie();
  const token = await prisma.token.findFirstOrThrow({ select: { publicId: true } });

  for (const [path, init] of [
    ["/patient/appointments", { headers: { cookie } }],
    [`/t/${token.publicId}`, {}],
  ] as const) {
    const page = await getPage(path, init);
    assert.match(page.body, /<meta name="robots" content="noindex/, `${path} should be noindex`);
  }
});
