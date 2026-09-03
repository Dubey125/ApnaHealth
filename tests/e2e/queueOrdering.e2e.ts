import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { nanoid } from "nanoid";
import { getPage, prisma, requireServer } from "./helpers";
import { QUEUE_ORDER_BY, countAhead, servedBeforeWhere } from "../../src/lib/queue/ordering";

// Queue reordering, verified where it actually matters: what the patient
// is told.
//
// The unit tests in src/lib/queue/ordering.test.ts prove the comparator.
// They cannot prove that Prisma translates QUEUE_ORDER_BY and
// servedBeforeWhere into the same rule once they become SQL, nor that the
// patient's own ticket page reflects a reorder made at the counter. Both
// of those are the parts that would silently mislead someone.
//
// Uses its own scratch session so it never disturbs seeded data, and
// tears it down in `after` regardless of outcome.

let sessionId: string;
let tokens: { id: string; publicId: string; tokenNumber: number }[] = [];

before(async () => {
  await requireServer();

  const doctor = await prisma.doctor.findFirstOrThrow({
    where: { isActive: true, clinic: { isActive: true, approvalStatus: "APPROVED" } },
  });

  const now = new Date();
  const created = await prisma.session.create({
    data: {
      clinicId: doctor.clinicId,
      doctorId: doctor.id,
      publicId: nanoid(),
      sessionDate: now,
      plannedStartAt: now,
      plannedEndAt: new Date(now.getTime() + 3 * 60 * 60 * 1000),
      locationLabel: "Reordering test room",
      status: "IN_PROGRESS",
      actualStartAt: now,
    },
  });
  sessionId = created.id;

  for (const tokenNumber of [1, 2, 3]) {
    const token = await prisma.token.create({
      data: {
        sessionId,
        publicId: nanoid(),
        tokenNumber,
        patientNameSnapshot: `Ordering Test ${tokenNumber}`,
        patientPhoneSnapshot: `+9199999000${tokenNumber}`,
        source: "WALK_IN",
        status: "CHECKED_IN",
        issuedAt: now,
        checkedInAt: now,
      },
    });
    tokens.push({ id: token.id, publicId: token.publicId, tokenNumber });
  }
});

after(async () => {
  if (!sessionId) return;
  const ids = tokens.map((t) => t.id);
  await prisma.predictionSnapshot.deleteMany({ where: { tokenId: { in: ids } } });
  await prisma.queueEvent.deleteMany({ where: { sessionId } });
  await prisma.token.deleteMany({ where: { sessionId } });
  await prisma.session.delete({ where: { id: sessionId } });
  tokens = [];
});

async function orderedNumbers(): Promise<number[]> {
  const rows = await prisma.token.findMany({
    where: { sessionId, status: "CHECKED_IN" },
    orderBy: QUEUE_ORDER_BY,
    select: { tokenNumber: true },
  });
  return rows.map((r) => r.tokenNumber);
}

test("with nobody prioritised, the database returns plain token order", async () => {
  assert.deepEqual(await orderedNumbers(), [1, 2, 3]);
});

test("the first patient is told they are next", async () => {
  const page = await getPage(`/t/${tokens[0].publicId}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /You&#x27;re next|You're next/, "expected the head of the queue to be told they are next");
});

test("prioritising the last patient reorders the queue in the database", async () => {
  await prisma.token.update({ where: { id: tokens[2].id }, data: { queuePriority: 1 } });
  assert.deepEqual(await orderedNumbers(), [3, 1, 2], "#3 was moved to the front");
});

test("servedBeforeWhere agrees with the comparator once it is real SQL", async () => {
  // The seam the unit tests cannot reach: Prisma turning the filter into
  // a WHERE clause. Checked for every token, against the in-memory rule.
  const all = await prisma.token.findMany({
    where: { sessionId, status: "CHECKED_IN" },
    select: { tokenNumber: true, queuePriority: true },
  });

  for (const token of all) {
    const counted = await prisma.token.count({
      where: { sessionId, status: "CHECKED_IN", ...servedBeforeWhere(token) },
    });
    assert.equal(
      counted,
      countAhead(token, all),
      `SQL and comparator disagree for #${token.tokenNumber} at priority ${token.queuePriority}`,
    );
  }
});

test("the patient who was overtaken is told so on their own ticket", async () => {
  // The whole point. #1 was next; a human at the counter moved #3 ahead
  // of them. If this still said "You're next", the reorder would be a lie
  // told to a patient sitting in the waiting room.
  const page = await getPage(`/t/${tokens[0].publicId}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /1 ahead of you/, "#1 should now be told one patient is ahead");
});

test("a reorder never renames a patient's token", async () => {
  // Token number is what is on the ticket, on the waiting-room screen and
  // called out loud. Service order changed; identity must not have.
  const rows = await prisma.token.findMany({ where: { sessionId }, select: { tokenNumber: true } });
  assert.deepEqual(
    rows.map((r) => r.tokenNumber).sort(),
    [1, 2, 3],
    "the same three token numbers must still exist after a reorder",
  );
});

test("the patient page never reveals why another patient was moved up", async () => {
  // The reason is staff-authored operational text about a specific
  // patient. It belongs in the audit log and on the clinic's own console,
  // never on a page whose link gets forwarded on WhatsApp.
  await prisma.queueEvent.create({
    data: {
      sessionId,
      tokenId: tokens[2].id,
      type: "TOKEN_REORDERED",
      occurredAt: new Date(),
      metadata: { reason: "SECRETCLINICALNOTE", fromPosition: 3, toPosition: 1 },
    },
  });

  for (const token of tokens) {
    const page = await getPage(`/t/${token.publicId}`);
    assert.ok(!page.body.includes("SECRETCLINICALNOTE"), `reorder reason leaked onto /t/${token.publicId}`);
  }
});
