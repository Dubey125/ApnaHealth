import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEW_ATTENTION_DAYS, daysWaiting, needsAttention, waitingLabel } from "./queue";

const now = new Date("2026-08-26T12:00:00.000Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

test("daysWaiting counts whole days only", () => {
  assert.equal(daysWaiting(daysAgo(0), now), 0);
  assert.equal(daysWaiting(new Date(now.getTime() - 23 * 60 * 60 * 1000), now), 0);
  assert.equal(daysWaiting(daysAgo(4), now), 4);
});

test("daysWaiting never goes negative for a clock skewed into the future", () => {
  assert.equal(daysWaiting(new Date(now.getTime() + 60_000), now), 0);
});

test("needsAttention triggers at the threshold, not after it", () => {
  assert.equal(needsAttention(daysAgo(REVIEW_ATTENTION_DAYS - 1), now), false);
  assert.equal(needsAttention(daysAgo(REVIEW_ATTENTION_DAYS), now), true);
});

test("waitingLabel reads naturally at 0, 1 and many days", () => {
  assert.equal(waitingLabel(daysAgo(0), now), "Submitted today");
  assert.equal(waitingLabel(daysAgo(1), now), "Waiting 1 day");
  assert.equal(waitingLabel(daysAgo(9), now), "Waiting 9 days");
});
