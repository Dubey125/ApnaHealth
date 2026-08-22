import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenCounts,
  noShowRate,
  waitTimeStats,
  consultDurationStats,
  predictionAccuracy,
  type TokenMetricInput,
} from "./metrics";

function token(overrides: Partial<TokenMetricInput> & { status: TokenMetricInput["status"] }): TokenMetricInput {
  return { checkedInAt: null, consultStartedAt: null, consultEndedAt: null, ...overrides };
}

test("tokenCounts reports a zero for every status, even ones absent from the input", () => {
  const result = tokenCounts([token({ status: "BOOKED" }), token({ status: "BOOKED" }), token({ status: "COMPLETED" })]);
  assert.equal(result.total, 3);
  assert.deepEqual(result.byStatus, {
    BOOKED: 2,
    CHECKED_IN: 0,
    IN_CONSULT: 0,
    COMPLETED: 1,
    NO_SHOW: 0,
    CANCELLED: 0,
  });
});

test("tokenCounts on an empty set", () => {
  assert.equal(tokenCounts([]).total, 0);
});

test("noShowRate excludes CANCELLED from the denominator", () => {
  const tokens = [
    token({ status: "COMPLETED" }),
    token({ status: "COMPLETED" }),
    token({ status: "COMPLETED" }),
    token({ status: "NO_SHOW" }),
    token({ status: "CANCELLED" }),
    token({ status: "CANCELLED" }),
  ];
  // 1 no-show out of (3 completed + 1 no-show) = 0.25, cancellations ignored.
  assert.equal(noShowRate(tokens), 0.25);
});

test("noShowRate is null when nothing has reached a known outcome yet", () => {
  assert.equal(noShowRate([token({ status: "BOOKED" }), token({ status: "CHECKED_IN" })]), null);
});

test("waitTimeStats computes median and p90 from checked-in to consult-started, ignoring tokens missing either timestamp", () => {
  const base = new Date("2026-08-20T10:00:00.000Z");
  const waits = [60, 120, 180, 240, 300, 600, 900, 1200, 1500, 3000]; // seconds
  const tokens = waits.map((seconds) =>
    token({
      status: "COMPLETED",
      checkedInAt: base,
      consultStartedAt: new Date(base.getTime() + seconds * 1000),
    }),
  );
  tokens.push(token({ status: "BOOKED" })); // no timestamps — must be ignored
  const stats = waitTimeStats(tokens);
  assert.equal(stats.sampleSize, 10);
  assert.equal(stats.medianSeconds, 450); // (300+600)/2
  assert.equal(stats.p90Seconds, 3000); // 90th percentile of 10 sorted values -> index 9
});

test("waitTimeStats is null on an empty set", () => {
  const stats = waitTimeStats([]);
  assert.equal(stats.medianSeconds, null);
  assert.equal(stats.p90Seconds, null);
  assert.equal(stats.sampleSize, 0);
});

test("consultDurationStats only counts COMPLETED tokens with both timestamps", () => {
  const start = new Date("2026-08-20T10:00:00.000Z");
  const tokens = [
    token({ status: "COMPLETED", consultStartedAt: start, consultEndedAt: new Date(start.getTime() + 300_000) }),
    token({ status: "COMPLETED", consultStartedAt: start, consultEndedAt: new Date(start.getTime() + 600_000) }),
    // IN_CONSULT: has a start but no end yet — must be excluded, not treated as a 0-duration visit.
    token({ status: "IN_CONSULT", consultStartedAt: start, consultEndedAt: null }),
  ];
  const stats = consultDurationStats(tokens);
  assert.equal(stats.sampleSize, 2);
  assert.equal(stats.medianSeconds, 450);
});

test("predictionAccuracy: median absolute error and window hit rate", () => {
  const predictedStartAt = new Date("2026-08-20T10:00:00.000Z");
  const windowStartAt = new Date("2026-08-20T09:55:00.000Z");
  const windowEndAt = new Date("2026-08-20T10:10:00.000Z");
  const evals = [
    { predictedStartAt, windowStartAt, windowEndAt, actualStartAt: new Date("2026-08-20T10:00:00.000Z") }, // exact hit, 0 error
    { predictedStartAt, windowStartAt, windowEndAt, actualStartAt: new Date("2026-08-20T10:05:00.000Z") }, // within window, 300s error
    { predictedStartAt, windowStartAt, windowEndAt, actualStartAt: new Date("2026-08-20T10:30:00.000Z") }, // outside window, 1800s error
  ];
  const result = predictionAccuracy(evals);
  assert.equal(result.sampleSize, 3);
  assert.equal(result.medianAbsErrorSeconds, 300);
  assert.equal(result.windowHitRate, 2 / 3);
});

test("predictionAccuracy is null on an empty set", () => {
  const result = predictionAccuracy([]);
  assert.equal(result.medianAbsErrorSeconds, null);
  assert.equal(result.windowHitRate, null);
  assert.equal(result.sampleSize, 0);
});
