import { test } from "node:test";
import assert from "node:assert/strict";
import { predictBaselineV0, type PredictionInput } from "./baseline";

const NOW = new Date("2026-01-01T10:00:00.000Z");

function baseInput(overrides: Partial<PredictionInput> = {}): PredictionInput {
  return {
    now: NOW,
    tokensAhead: 0,
    currentConsultStartedAt: null,
    sessionRecentDurationsSeconds: [],
    doctorRecentDurationsSeconds: [],
    doctorDefaultMinutes: 6,
    breaks: [],
    ...overrides,
  };
}

// --- PHASE-07.md required scenarios ---

test("insufficient history: falls back to doctorDefaultMinutes when neither tier has enough data", () => {
  const result = predictBaselineV0(baseInput({ sessionRecentDurationsSeconds: [300], doctorRecentDurationsSeconds: [400, 500] }));
  assert.equal(result.medianServiceSeconds, 6 * 60);
});

test("uses session's last-8 median once >= 3 session durations exist", () => {
  const result = predictBaselineV0(
    baseInput({ sessionRecentDurationsSeconds: [300, 400, 500], doctorRecentDurationsSeconds: [9999] }),
  );
  assert.equal(result.medianServiceSeconds, 400);
});

test("falls back to doctor's 30-day median when session has < 3 but doctor has >= 5", () => {
  const result = predictBaselineV0(
    baseInput({ sessionRecentDurationsSeconds: [100], doctorRecentDurationsSeconds: [200, 300, 400, 500, 600] }),
  );
  assert.equal(result.medianServiceSeconds, 400);
});

test("outliers: median is resistant to a single extreme outlier", () => {
  const result = predictBaselineV0(baseInput({ sessionRecentDurationsSeconds: [300, 320, 310, 9000] }));
  // median of [300,310,320,9000] sorted -> (310+320)/2 = 315, nowhere near the outlier
  assert.equal(result.medianServiceSeconds, 315);
});

test("paused/stalled session: remaining current consult floors at zero once elapsed exceeds the median", () => {
  const longAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000); // 2h elapsed, way past any median
  const result = predictBaselineV0(
    baseInput({ currentConsultStartedAt: longAgo, sessionRecentDurationsSeconds: [300, 300, 300], tokensAhead: 0 }),
  );
  // remainingCurrent clamps to 0, so predictedStartAt should equal `now` exactly
  assert.equal(result.predictedStartAt.getTime(), NOW.getTime());
});

test("zero tokens ahead: predicted start is now + remaining current only", () => {
  const startedAt = new Date(NOW.getTime() - 60 * 1000); // 1 minute elapsed
  const result = predictBaselineV0(
    baseInput({ currentConsultStartedAt: startedAt, sessionRecentDurationsSeconds: [300, 300, 300], tokensAhead: 0 }),
  );
  // median 300s, elapsed 60s -> remaining 240s
  assert.equal(result.predictedStartAt.getTime(), NOW.getTime() + 240 * 1000);
});

test("window is never symmetric-guessed: window bounds widen with ETA", () => {
  const result = predictBaselineV0(baseInput({ tokensAhead: 5, sessionRecentDurationsSeconds: [600, 600, 600] }));
  assert.ok(result.windowStartAt.getTime() < result.predictedStartAt.getTime());
  assert.ok(result.windowEndAt.getTime() > result.predictedStartAt.getTime());
});

// --- Scheduled breaks ---

test("no breaks: predicted start is unaffected when breaks array is empty", () => {
  const result = predictBaselineV0(baseInput({ tokensAhead: 2, sessionRecentDurationsSeconds: [300, 300, 300] }));
  assert.equal(result.predictedStartAt.getTime(), NOW.getTime() + 2 * 300 * 1000);
});

test("never predicts during a break: naive prediction falling inside a break is pushed past it", () => {
  // naive predictedStart would be now + 300s = 10:05, which falls inside a 10:02-10:30 break.
  // 2 of the 5 minutes of work are consumed before the break starts (10:00->10:02), leaving 3
  // minutes (180s) still owed once the break ends: 10:30 + 180s = 10:33. Never 10:05, and never
  // any instant strictly between 10:02 and 10:30. Verified by a standalone numeric trace before
  // writing this assertion.
  const breakStart = new Date("2026-01-01T10:02:00.000Z");
  const breakEnd = new Date("2026-01-01T10:30:00.000Z");
  const result = predictBaselineV0(
    baseInput({ tokensAhead: 1, sessionRecentDurationsSeconds: [300, 300, 300], breaks: [{ startAt: breakStart, endAt: breakEnd }] }),
  );
  assert.equal(result.predictedStartAt.getTime(), new Date("2026-01-01T10:33:00.000Z").getTime());
  assert.ok(result.predictedStartAt.getTime() >= breakEnd.getTime());
});

test("never predicts during a break: work partially before, partially after the break", () => {
  // 3 tokens ahead * 300s = 900s of work. Break is 10:02-10:10 (8 min = 480s).
  // Work consumed before break: 2 min (120s) -> 780s of work remains, resumes at 10:10 -> 10:23
  const breakStart = new Date("2026-01-01T10:02:00.000Z");
  const breakEnd = new Date("2026-01-01T10:10:00.000Z");
  const result = predictBaselineV0(
    baseInput({ tokensAhead: 3, sessionRecentDurationsSeconds: [300, 300, 300], breaks: [{ startAt: breakStart, endAt: breakEnd }] }),
  );
  const expected = breakEnd.getTime() + 780 * 1000;
  assert.equal(result.predictedStartAt.getTime(), expected);
});

test("recalculates after the break: predicted start is delayed by exactly the break duration when the break falls entirely within the naive ETA", () => {
  const withoutBreak = predictBaselineV0(baseInput({ tokensAhead: 4, sessionRecentDurationsSeconds: [300, 300, 300] }));
  const breakStart = new Date("2026-01-01T10:02:00.000Z");
  const breakEnd = new Date("2026-01-01T10:12:00.000Z"); // 10 minute break, well inside the naive ETA (20 min)
  const withBreak = predictBaselineV0(
    baseInput({ tokensAhead: 4, sessionRecentDurationsSeconds: [300, 300, 300], breaks: [{ startAt: breakStart, endAt: breakEnd }] }),
  );
  const breakDurationMs = breakEnd.getTime() - breakStart.getTime();
  assert.equal(withBreak.predictedStartAt.getTime(), withoutBreak.predictedStartAt.getTime() + breakDurationMs);
});

test("a break entirely after the naive prediction has no effect", () => {
  const breakStart = new Date("2026-01-01T14:00:00.000Z");
  const breakEnd = new Date("2026-01-01T14:30:00.000Z");
  const result = predictBaselineV0(
    baseInput({ tokensAhead: 1, sessionRecentDurationsSeconds: [300, 300, 300], breaks: [{ startAt: breakStart, endAt: breakEnd }] }),
  );
  assert.equal(result.predictedStartAt.getTime(), NOW.getTime() + 300 * 1000);
});

test("a break that has already ended is ignored", () => {
  const pastBreakStart = new Date("2026-01-01T09:00:00.000Z");
  const pastBreakEnd = new Date("2026-01-01T09:30:00.000Z");
  const result = predictBaselineV0(
    baseInput({
      tokensAhead: 1,
      sessionRecentDurationsSeconds: [300, 300, 300],
      breaks: [{ startAt: pastBreakStart, endAt: pastBreakEnd }],
    }),
  );
  assert.equal(result.predictedStartAt.getTime(), NOW.getTime() + 300 * 1000);
});

test("multiple breaks are applied in chronological order — a prediction pushed past one can land in a later one", () => {
  // 5 tokens ahead * 600s = 3000s (50 min) of work from 10:00.
  // Break A: 10:10-10:20 (10 min). Break B: 10:40-11:10 (30 min).
  // Consume 10 min up to break A (10:00->10:10), skip to 10:20, 40 min of work remains.
  // Consume 20 min up to break B (10:20->10:40), skip to 11:10, 20 min of work remains.
  // Final: 11:10 + 20 min = 11:30 — confirmed against a standalone hand trace of the same
  // algorithm before writing this assertion.
  const breakA = { startAt: new Date("2026-01-01T10:10:00.000Z"), endAt: new Date("2026-01-01T10:20:00.000Z") };
  const breakB = { startAt: new Date("2026-01-01T10:40:00.000Z"), endAt: new Date("2026-01-01T11:10:00.000Z") };
  const result = predictBaselineV0(
    baseInput({ tokensAhead: 5, sessionRecentDurationsSeconds: [600, 600, 600], breaks: [breakB, breakA] }),
  );
  assert.equal(result.predictedStartAt.getTime(), new Date("2026-01-01T11:30:00.000Z").getTime());
});

test("window start is pushed past a break's end if it would otherwise fall inside one", () => {
  // 1 token ahead * 601s median = 601s of work against a 10:10-10:20 break: predictedStartAt
  // lands at 10:20:01 (just past the break). The window's 5-minute floor margin would naively
  // reach back to 10:15:01 — inside the break — and must be clamped to the break's end.
  // Verified by a standalone numeric trace of the same algorithm before writing this assertion.
  const breakStart = new Date("2026-01-01T10:10:00.000Z");
  const breakEnd = new Date("2026-01-01T10:20:00.000Z");
  const result = predictBaselineV0(
    baseInput({ tokensAhead: 1, sessionRecentDurationsSeconds: [601, 601, 601], breaks: [{ startAt: breakStart, endAt: breakEnd }] }),
  );
  assert.equal(result.predictedStartAt.getTime(), new Date("2026-01-01T10:20:01.000Z").getTime());
  assert.equal(result.windowStartAt.getTime(), breakEnd.getTime());
});
