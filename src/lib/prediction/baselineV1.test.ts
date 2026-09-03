import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_TYPE_SAMPLES, predictBaselineV0, predictBaselineV1, type TypedPredictionInput } from "./baseline";

const NOW = new Date("2026-01-01T10:00:00.000Z");

function input(overrides: Partial<TypedPredictionInput> = {}): TypedPredictionInput {
  return {
    now: NOW,
    aheadVisitTypes: [],
    currentVisitType: null,
    currentConsultStartedAt: null,
    sessionRecentDurationsSeconds: [],
    doctorRecentDurationsSeconds: [],
    durationsSecondsByType: {},
    doctorDefaultMinutes: 6,
    breaks: [],
    ...overrides,
  };
}

/** `count` samples that all take `seconds`, so the median is unambiguous. */
const samples = (seconds: number, count = MIN_TYPE_SAMPLES) => Array.from({ length: count }, () => seconds);

const etaSeconds = (result: { predictedStartAt: Date }) => (result.predictedStartAt.getTime() - NOW.getTime()) / 1000;

test("with no type evidence, v1 predicts exactly what v0 predicts", () => {
  // The property that makes this safe to ship. A clinic that has never
  // recorded a visit type gets the model it already had — v1 improves as
  // evidence accumulates, not on the day the column was added.
  const shared = {
    sessionRecentDurationsSeconds: [300, 400, 500],
    currentConsultStartedAt: new Date(NOW.getTime() - 60_000),
  };
  const aheadTypes = ["UNSPECIFIED", "UNSPECIFIED", "UNSPECIFIED"];

  const v1 = predictBaselineV1(input({ ...shared, aheadVisitTypes: aheadTypes, currentVisitType: "UNSPECIFIED" }));
  const v0 = predictBaselineV0({
    now: NOW,
    tokensAhead: aheadTypes.length,
    currentConsultStartedAt: shared.currentConsultStartedAt,
    sessionRecentDurationsSeconds: shared.sessionRecentDurationsSeconds,
    doctorRecentDurationsSeconds: [],
    doctorDefaultMinutes: 6,
    breaks: [],
  });

  assert.equal(v1.predictedStartAt.getTime(), v0.predictedStartAt.getTime());
  assert.equal(v1.windowStartAt.getTime(), v0.windowStartAt.getTime());
  assert.equal(v1.windowEndAt.getTime(), v0.windowEndAt.getTime());
  assert.equal(v1.medianServiceSeconds, v0.medianServiceSeconds);
});

test("a typed token still falls back to the overall median below the sample threshold", () => {
  const tooFew = samples(1200, MIN_TYPE_SAMPLES - 1);
  const result = predictBaselineV1(
    input({
      aheadVisitTypes: ["PROCEDURE"],
      sessionRecentDurationsSeconds: [300, 300, 300],
      durationsSecondsByType: { PROCEDURE: tooFew },
    }),
  );
  assert.equal(etaSeconds(result), 300, "four samples is noise; the stable overall median is the safer answer");
});

test("one more sample crosses the threshold and the type's own median takes over", () => {
  const result = predictBaselineV1(
    input({
      aheadVisitTypes: ["PROCEDURE"],
      sessionRecentDurationsSeconds: [300, 300, 300],
      durationsSecondsByType: { PROCEDURE: samples(1200) },
    }),
  );
  assert.equal(etaSeconds(result), 1200);
});

test("four follow-ups and four procedures no longer predict the same wait", () => {
  // The entire point of v1. Under v0 both of these are 4 x the overall
  // median, so a queue of quick follow-ups and a queue of long procedures
  // are told the same thing — and one of those two is badly wrong.
  const durationsSecondsByType = { FOLLOW_UP: samples(120), PROCEDURE: samples(1800) };
  const common = { sessionRecentDurationsSeconds: [600, 600, 600], durationsSecondsByType };

  const followUps = predictBaselineV1(input({ ...common, aheadVisitTypes: Array(4).fill("FOLLOW_UP") }));
  const procedures = predictBaselineV1(input({ ...common, aheadVisitTypes: Array(4).fill("PROCEDURE") }));

  assert.equal(etaSeconds(followUps), 480);
  assert.equal(etaSeconds(procedures), 7200);
  assert.ok(etaSeconds(procedures) > etaSeconds(followUps), "a procedure queue must predict a longer wait");
});

test("a mixed queue sums each visit type rather than averaging them", () => {
  const result = predictBaselineV1(
    input({
      aheadVisitTypes: ["FOLLOW_UP", "PROCEDURE", "FOLLOW_UP"],
      sessionRecentDurationsSeconds: [600, 600, 600],
      durationsSecondsByType: { FOLLOW_UP: samples(120), PROCEDURE: samples(1800) },
    }),
  );
  assert.equal(etaSeconds(result), 120 + 1800 + 120);
});

test("an untyped patient in a typed queue contributes the overall median", () => {
  const result = predictBaselineV1(
    input({
      aheadVisitTypes: ["FOLLOW_UP", "UNSPECIFIED"],
      sessionRecentDurationsSeconds: [600, 600, 600],
      durationsSecondsByType: { FOLLOW_UP: samples(120) },
    }),
  );
  assert.equal(etaSeconds(result), 120 + 600);
});

test("UNSPECIFIED never forms a distribution of its own, even with ample samples", () => {
  // Historical rows all carry UNSPECIFIED. Letting them behave as a type
  // would dress "nobody recorded this" up as a finding about a real
  // category of visit.
  const result = predictBaselineV1(
    input({
      aheadVisitTypes: ["UNSPECIFIED"],
      sessionRecentDurationsSeconds: [600, 600, 600],
      durationsSecondsByType: { UNSPECIFIED: samples(30, 50) },
    }),
  );
  assert.equal(etaSeconds(result), 600, "the overall median, not the 30s UNSPECIFIED median");
});

test("the patient in the chair is measured against their own visit type", () => {
  // A procedure under way is not nearly finished just because the average
  // consultation would have been.
  const startedAt = new Date(NOW.getTime() - 300_000); // 5 minutes elapsed
  const common = {
    currentConsultStartedAt: startedAt,
    sessionRecentDurationsSeconds: [600, 600, 600],
    durationsSecondsByType: { PROCEDURE: samples(1800), FOLLOW_UP: samples(120) },
  };

  const procedure = predictBaselineV1(input({ ...common, currentVisitType: "PROCEDURE" }));
  const followUp = predictBaselineV1(input({ ...common, currentVisitType: "FOLLOW_UP" }));

  assert.equal(etaSeconds(procedure), 1800 - 300, "a 30-minute procedure 5 minutes in has 25 left");
  assert.equal(etaSeconds(followUp), 0, "a 2-minute follow-up 5 minutes in is already overdue, floored at zero");
});

test("an overrunning consultation still floors at zero rather than going negative", () => {
  const result = predictBaselineV1(
    input({
      currentConsultStartedAt: new Date(NOW.getTime() - 4 * 60 * 60 * 1000),
      currentVisitType: "FOLLOW_UP",
      sessionRecentDurationsSeconds: [600, 600, 600],
      durationsSecondsByType: { FOLLOW_UP: samples(120) },
    }),
  );
  assert.equal(result.predictedStartAt.getTime(), NOW.getTime());
});

test("v1 reports the service time it used for each type", () => {
  const result = predictBaselineV1(
    input({
      aheadVisitTypes: ["FOLLOW_UP", "PROCEDURE"],
      sessionRecentDurationsSeconds: [600, 600, 600],
      durationsSecondsByType: { FOLLOW_UP: samples(120), PROCEDURE: samples(1800) },
    }),
  );
  assert.equal(result.serviceSecondsByType.FOLLOW_UP, 120);
  assert.equal(result.serviceSecondsByType.PROCEDURE, 1800);
});

test("v1 stamps its own model version so snapshots stay comparable", () => {
  assert.equal(predictBaselineV1(input()).modelVersion, "baseline-v1");
  assert.notEqual(predictBaselineV1(input()).modelVersion, predictBaselineV0({
    now: NOW,
    tokensAhead: 0,
    currentConsultStartedAt: null,
    sessionRecentDurationsSeconds: [],
    doctorRecentDurationsSeconds: [],
    doctorDefaultMinutes: 6,
    breaks: [],
  }).modelVersion);
});

test("breaks are still skipped, and a long typed queue can be pushed past one", () => {
  const breakStart = new Date(NOW.getTime() + 10 * 60_000);
  const breakEnd = new Date(NOW.getTime() + 40 * 60_000);
  const result = predictBaselineV1(
    input({
      aheadVisitTypes: ["PROCEDURE"],
      sessionRecentDurationsSeconds: [600, 600, 600],
      durationsSecondsByType: { PROCEDURE: samples(1800) },
      breaks: [{ startAt: breakStart, endAt: breakEnd }],
    }),
  );
  // 30 minutes of work, 10 of which fit before a 30-minute break: the
  // remaining 20 resume at the break's end.
  assert.equal(etaSeconds(result), 10 * 60 + 30 * 60 + 20 * 60);
});
