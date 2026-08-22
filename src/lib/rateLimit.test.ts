import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRateLimit } from "./rateLimit";

test("the first request for a key is always allowed", () => {
  const buckets = new Map();
  const result = evaluateRateLimit(buckets, "ip1", 3, 60_000, 1_000);
  assert.equal(result.allowed, true);
});

test("requests up to the limit are allowed, the one after is blocked", () => {
  const buckets = new Map();
  const now = 1_000;
  assert.equal(evaluateRateLimit(buckets, "ip1", 3, 60_000, now).allowed, true);
  assert.equal(evaluateRateLimit(buckets, "ip1", 3, 60_000, now).allowed, true);
  assert.equal(evaluateRateLimit(buckets, "ip1", 3, 60_000, now).allowed, true);
  const blocked = evaluateRateLimit(buckets, "ip1", 3, 60_000, now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
});

test("retryAfterSeconds counts down as the window elapses", () => {
  const buckets = new Map();
  evaluateRateLimit(buckets, "ip1", 1, 60_000, 0);
  const blocked = evaluateRateLimit(buckets, "ip1", 1, 60_000, 45_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 15);
});

test("a new window resets the count and allows the request", () => {
  const buckets = new Map();
  evaluateRateLimit(buckets, "ip1", 1, 60_000, 0);
  assert.equal(evaluateRateLimit(buckets, "ip1", 1, 60_000, 30_000).allowed, false);
  const afterWindow = evaluateRateLimit(buckets, "ip1", 1, 60_000, 60_000);
  assert.equal(afterWindow.allowed, true);
});

test("different keys are tracked independently", () => {
  const buckets = new Map();
  evaluateRateLimit(buckets, "ip1", 1, 60_000, 0);
  const blockedIp1 = evaluateRateLimit(buckets, "ip1", 1, 60_000, 0);
  const ip2 = evaluateRateLimit(buckets, "ip2", 1, 60_000, 0);
  assert.equal(blockedIp1.allowed, false);
  assert.equal(ip2.allowed, true);
});
