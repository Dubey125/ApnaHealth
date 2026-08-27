import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKABLE_SESSION_STATUSES,
  LISTED_CLINIC,
  LISTED_DOCTOR,
  LISTED_SESSION,
  bookableSessionWhere,
  isBookableSessionStatus,
} from "./publicListing";

// These are contract tests, not behaviour tests. The bug they exist to
// catch was a *missing clause* in a query: the /book server action looked
// a session up by id alone and checked only its status, so a rejected
// facility kept issuing public tokens through the action while its page
// correctly 404'd. Asserting on the shape of the where-clause is what
// makes that class of regression fail loudly — a behaviour test against a
// live database would not run in this suite, and would not have caught the
// original omission either, since the page-level path was always correct.

test("LISTED_CLINIC requires BOTH platform approval and the facility's own active flag", () => {
  assert.equal(LISTED_CLINIC.approvalStatus, "APPROVED");
  assert.equal(LISTED_CLINIC.isActive, true);
});

test("LISTED_DOCTOR carries the clinic approval clause, not just doctor.isActive", () => {
  assert.equal(LISTED_DOCTOR.isActive, true);
  assert.deepEqual(LISTED_DOCTOR.clinic, LISTED_CLINIC);
});

test("LISTED_SESSION carries the clinic approval clause", () => {
  assert.deepEqual(LISTED_SESSION.clinic, LISTED_CLINIC);
});

test("bookableSessionWhere scopes by id AND facility approval", () => {
  const where = bookableSessionWhere("session-123");
  assert.equal(where.id, "session-123");
  // The regression guard: if someone reverts the action to a bare id
  // lookup, or drops the spread, this clause disappears and this fails.
  assert.deepEqual(where.clinic, LISTED_CLINIC);
});

test("a rejected or pending facility cannot satisfy bookableSessionWhere", () => {
  const where = bookableSessionWhere("session-123");
  const clinic = where.clinic as { approvalStatus?: string } | undefined;
  // Prisma turns this clause into `clinic.approvalStatus = 'APPROVED'`, so
  // PENDING and REJECTED rows are excluded by the database, not by a
  // conditional the caller could forget to write.
  assert.ok(clinic);
  assert.equal(clinic.approvalStatus, "APPROVED");
  assert.notEqual(clinic.approvalStatus, "PENDING");
  assert.notEqual(clinic.approvalStatus, "REJECTED");
});

test("only OPEN and IN_PROGRESS sessions accept public bookings", () => {
  assert.equal(isBookableSessionStatus("OPEN"), true);
  assert.equal(isBookableSessionStatus("IN_PROGRESS"), true);
  assert.equal(isBookableSessionStatus("SCHEDULED"), false);
  assert.equal(isBookableSessionStatus("PAUSED"), false);
  assert.equal(isBookableSessionStatus("CLOSED"), false);
});

test("BOOKABLE_SESSION_STATUSES stays exactly the two open states", () => {
  assert.deepEqual([...BOOKABLE_SESSION_STATUSES], ["OPEN", "IN_PROGRESS"]);
});
