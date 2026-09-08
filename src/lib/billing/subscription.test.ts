import { test } from "node:test";
import assert from "node:assert/strict";
import type { SubscriptionStatus } from "@/generated/prisma/enums";
import {
  GRACE_DAYS,
  PLAN_SEATS,
  TRIAL_DAYS,
  addDays,
  assertTransition,
  canTransition,
  daysRemaining,
  dueStatusChange,
  fieldsForTransition,
  trialDefaults,
} from "./subscription";

const NOW = new Date("2026-03-01T09:00:00.000Z");
const ALL_STATUSES: SubscriptionStatus[] = ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"];

test("a lapsed customer can always come back by paying", () => {
  // Never close this path. A returning lapsed customer is the cheapest
  // revenue there is, and a state machine that traps them is a bug with a
  // commercial cost.
  assert.ok(canTransition("SUSPENDED", "ACTIVE"));
  assert.ok(canTransition("CANCELLED", "ACTIVE"));
});

test("a cancelled subscription cannot drift back to trialing or past-due", () => {
  assert.equal(canTransition("CANCELLED", "TRIALING"), false);
  assert.equal(canTransition("CANCELLED", "PAST_DUE"), false);
  assert.equal(canTransition("CANCELLED", "SUSPENDED"), false);
});

test("a trial cannot become past-due — there is nothing to fail to pay", () => {
  assert.equal(canTransition("TRIALING", "PAST_DUE"), false);
});

test("no status can transition to itself", () => {
  for (const status of ALL_STATUSES) {
    assert.equal(canTransition(status, status), false, `${status} -> ${status} should be rejected`);
  }
});

test("assertTransition throws on an illegal move and names both ends", () => {
  assert.throws(() => assertTransition("CANCELLED", "TRIALING"), /CANCELLED -> TRIALING/);
  assert.doesNotThrow(() => assertTransition("PAST_DUE", "ACTIVE"));
});

test("a trial starts entitled with a real deadline", () => {
  const defaults = trialDefaults({ now: NOW });
  assert.equal(defaults.status, "TRIALING");
  assert.equal(defaults.doctorSeats, PLAN_SEATS.TRIAL);
  assert.equal(defaults.trialEndsAt.getTime(), addDays(NOW, TRIAL_DAYS).getTime());
});

test("an expired trial is due for suspension, and an unexpired one is not", () => {
  const trialEndsAt = addDays(NOW, TRIAL_DAYS);
  const clock = { status: "TRIALING" as const, trialEndsAt, gracePeriodEndsAt: null };

  assert.equal(dueStatusChange(clock, NOW), null, "nothing is due on day one");
  assert.equal(dueStatusChange(clock, addDays(NOW, TRIAL_DAYS - 1)), null, "not due the day before");
  assert.equal(dueStatusChange(clock, trialEndsAt), "SUSPENDED", "due exactly at the deadline");
});

test("grace expiry suspends, but not one second early", () => {
  const gracePeriodEndsAt = addDays(NOW, GRACE_DAYS);
  const clock = { status: "PAST_DUE" as const, trialEndsAt: null, gracePeriodEndsAt };

  assert.equal(dueStatusChange(clock, new Date(gracePeriodEndsAt.getTime() - 1000)), null);
  assert.equal(dueStatusChange(clock, gracePeriodEndsAt), "SUSPENDED");
});

test("an active subscription is never spontaneously suspended by the clock", () => {
  // Only TRIALING and PAST_DUE have deadlines. A paying clinic with a
  // stale date on the row must not be caught by them.
  const clock = { status: "ACTIVE" as const, trialEndsAt: NOW, gracePeriodEndsAt: NOW };
  assert.equal(dueStatusChange(clock, addDays(NOW, 365)), null);
});

test("recovering a payment clears BOTH deadlines", () => {
  // The bug this guards: leaving gracePeriodEndsAt set after a successful
  // payment would re-suspend a clinic that has actually paid, on a date
  // nobody could explain.
  const fields = fieldsForTransition("ACTIVE", "STARTER", NOW);
  assert.equal(fields.status, "ACTIVE");
  assert.equal(fields.gracePeriodEndsAt, null);
  assert.equal(fields.trialEndsAt, null);
});

test("converting from a trial lands on a real paid plan and its seats", () => {
  const fields = fieldsForTransition("ACTIVE", "TRIAL", NOW);
  assert.equal(fields.plan, "STARTER", "TRIAL is not a plan anyone stays on");
  assert.equal(fields.doctorSeats, PLAN_SEATS.STARTER);
  assert.equal(fields.currentPeriodStartAt?.getTime(), NOW.getTime());
});

test("converting an existing paid plan keeps that plan's seats", () => {
  const fields = fieldsForTransition("ACTIVE", "GROWTH", NOW);
  assert.equal(fields.plan, "GROWTH");
  assert.equal(fields.doctorSeats, PLAN_SEATS.GROWTH);
});

test("entering past-due sets a grace deadline in the future", () => {
  const fields = fieldsForTransition("PAST_DUE", "STARTER", NOW);
  assert.equal(fields.gracePeriodEndsAt?.getTime(), addDays(NOW, GRACE_DAYS).getTime());
  assert.ok(fields.gracePeriodEndsAt! > NOW);
});

test("daysRemaining rounds up and floors at zero", () => {
  assert.equal(daysRemaining(addDays(NOW, 3), NOW), 3);
  // Part of a day still counts as a day — telling an owner "0 days left"
  // when they have nine hours would be wrong.
  assert.equal(daysRemaining(new Date(NOW.getTime() + 60_000), NOW), 1);
  assert.equal(daysRemaining(addDays(NOW, -5), NOW), 0, "an overdue deadline is never negative");
  assert.equal(daysRemaining(null, NOW), null);
});
