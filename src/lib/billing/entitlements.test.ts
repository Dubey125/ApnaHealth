import { test } from "node:test";
import assert from "node:assert/strict";
import type { SubscriptionStatus } from "@/generated/prisma/enums";
import { UNBILLED_ENTITLEMENTS, entitlementsFor, hasSeatAvailable, seatOverage } from "./entitlements";

const ALL_STATUSES: SubscriptionStatus[] = ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"];

test("a patient already holding a token can ALWAYS be seen, in every status", () => {
  // The single most important property in the billing system. A clinic's
  // patients are not party to the commercial relationship and must never
  // be the leverage in it. If this test ever fails, someone has made it
  // possible for an unpaid invoice to strand a waiting room.
  for (const status of ALL_STATUSES) {
    assert.equal(
      entitlementsFor(status).canOperateExistingQueue,
      true,
      `${status} must still allow the existing queue to be run`,
    );
  }
});

test("a clinic with no subscription row at all is fully entitled", () => {
  // Fails open. Every clinic predating billing has no row, and a missing
  // row is our data gap, not their non-payment.
  assert.equal(UNBILLED_ENTITLEMENTS.canIssueTokens, true);
  assert.equal(UNBILLED_ENTITLEMENTS.canScheduleNewWork, true);
  assert.equal(UNBILLED_ENTITLEMENTS.canOperateExistingQueue, true);
  assert.equal(UNBILLED_ENTITLEMENTS.notice, "none");
});

test("a failed payment changes nothing operationally", () => {
  // PAST_DUE is usually an expired card. The clinic finds out from a
  // banner, not from a queue that stopped during morning OPD.
  const past = entitlementsFor("PAST_DUE");
  const active = entitlementsFor("ACTIVE");
  assert.equal(past.canIssueTokens, active.canIssueTokens);
  assert.equal(past.canScheduleNewWork, active.canScheduleNewWork);
  assert.equal(past.canViewAnalytics, active.canViewAnalytics);
  assert.equal(past.notice, "payment_failed", "the only difference is that they are told");
});

test("suspension stops new commitments but not existing ones", () => {
  const suspended = entitlementsFor("SUSPENDED");
  assert.equal(suspended.canIssueTokens, false, "no new promises to patients");
  assert.equal(suspended.canScheduleNewWork, false, "no new sessions or doctors");
  assert.equal(suspended.canOperateExistingQueue, true, "today's list still gets finished");
});

test("cancellation keeps the same operational floor as suspension", () => {
  const cancelled = entitlementsFor("CANCELLED");
  assert.equal(cancelled.canIssueTokens, false);
  assert.equal(cancelled.canOperateExistingQueue, true);
});

test("a trial is fully entitled, and says so", () => {
  const trial = entitlementsFor("TRIALING");
  assert.equal(trial.canIssueTokens, true);
  assert.equal(trial.canScheduleNewWork, true);
  assert.equal(trial.notice, "trial");
});

test("every status yields a notice, so an owner is never left guessing", () => {
  for (const status of ALL_STATUSES) {
    assert.ok(entitlementsFor(status).notice.length > 0, `${status} has no notice`);
  }
});

test("seats are enforced when adding, not retroactively", () => {
  assert.equal(hasSeatAvailable(2, 3), true);
  assert.equal(hasSeatAvailable(3, 3), false, "the seat limit is a ceiling, not a target");

  // A downgrade that leaves a clinic over its allowance reports the
  // overage rather than delisting doctors patients are booked with.
  assert.equal(seatOverage(5, 3), 2);
  assert.equal(seatOverage(2, 3), 0);
});
