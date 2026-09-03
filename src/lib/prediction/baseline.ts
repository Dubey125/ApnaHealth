export interface BreakInterval {
  startAt: Date;
  endAt: Date;
}

export interface PredictionInput {
  now: Date;
  tokensAhead: number;
  currentConsultStartedAt: Date | null;
  /** This session's completed consult durations, most recent first. */
  sessionRecentDurationsSeconds: number[];
  /** The doctor's completed consult durations across the last 30 days (any session). */
  doctorRecentDurationsSeconds: number[];
  doctorDefaultMinutes: number;
  /** Scheduled breaks for this session; order doesn't matter, sorted internally. */
  breaks: BreakInterval[];
}

export interface PredictionOutput {
  modelVersion: string;
  predictedStartAt: Date;
  windowStartAt: Date;
  windowEndAt: Date;
  medianServiceSeconds: number;
}

const MODEL_VERSION = "baseline-v0";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeMedianServiceSeconds(input: PredictionInput): number {
  if (input.sessionRecentDurationsSeconds.length >= 3) {
    return median(input.sessionRecentDurationsSeconds.slice(0, 8));
  }
  if (input.doctorRecentDurationsSeconds.length >= 5) {
    return median(input.doctorRecentDurationsSeconds);
  }
  return input.doctorDefaultMinutes * 60;
}

// Advances `startTime` by `workSeconds` of actual consultation time,
// treating every break as blocked time that doesn't count toward the work
// budget: time before a break is consumed normally, the break itself is
// skipped entirely, and any remaining work resumes consuming from the
// break's end. Breaks already fully in the past (endAt <= startTime) are
// ignored; breaks are processed in chronological order so a prediction
// pushed past one break can still be pushed past a later one.
function skipBreaks(startTime: Date, workSeconds: number, breaks: BreakInterval[]): Date {
  const relevant = breaks
    .filter((b) => b.endAt.getTime() > startTime.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  let cursorMs = startTime.getTime();
  let remainingMs = workSeconds * 1000;

  for (const brk of relevant) {
    const breakStartMs = brk.startAt.getTime();
    const breakEndMs = brk.endAt.getTime();
    if (cursorMs >= breakEndMs) continue;
    if (cursorMs + remainingMs <= breakStartMs) break;
    if (cursorMs < breakStartMs) {
      remainingMs -= breakStartMs - cursorMs;
      cursorMs = breakStartMs;
    }
    cursorMs = breakEndMs;
  }

  return new Date(cursorMs + remainingMs);
}

// Pushes a timestamp that lands inside any break to that break's end.
// Applied to the prediction window's lower bound, which — unlike
// predictedStartAt — isn't produced by skipBreaks and so isn't
// automatically break-free.
function pushPastAnyBreak(time: Date, breaks: BreakInterval[]): Date {
  let result = time;
  for (const brk of breaks) {
    if (result.getTime() >= brk.startAt.getTime() && result.getTime() < brk.endAt.getTime()) {
      result = brk.endAt;
    }
  }
  return result;
}

export function predictBaselineV0(input: PredictionInput): PredictionOutput {
  const medianServiceSeconds = computeMedianServiceSeconds(input);

  const elapsedSeconds = input.currentConsultStartedAt
    ? (input.now.getTime() - input.currentConsultStartedAt.getTime()) / 1000
    : 0;
  const remainingCurrentSeconds = input.currentConsultStartedAt ? Math.max(0, medianServiceSeconds - elapsedSeconds) : 0;

  const workSeconds = remainingCurrentSeconds + input.tokensAhead * medianServiceSeconds;
  const predictedStartAt = skipBreaks(input.now, workSeconds, input.breaks);

  const etaSeconds = (predictedStartAt.getTime() - input.now.getTime()) / 1000;
  const windowStartAt = pushPastAnyBreak(
    new Date(predictedStartAt.getTime() - Math.max(300, 0.15 * etaSeconds) * 1000),
    input.breaks,
  );
  const windowEndAt = new Date(predictedStartAt.getTime() + Math.max(600, 0.35 * etaSeconds) * 1000);

  return {
    modelVersion: MODEL_VERSION,
    predictedStartAt,
    windowStartAt,
    windowEndAt,
    medianServiceSeconds,
  };
}

// --- baseline-v1: per-visit-type service times ---
//
// v0 assumes every consultation is the same length. It multiplies one
// median by the number of people ahead, so a queue of four follow-ups and
// a queue of four first consultations predict identically — and in a real
// OPD those are not close to the same wait. That single assumption is the
// largest avoidable source of prediction error in the model.
//
// v1 changes exactly one thing: instead of `tokensAhead x median`, it adds
// up what each person ahead is actually expected to take, using a
// service-time median kept per visit type.
//
// Everything else — the break handling, the window arithmetic, the
// fallback tiers — is v0's, unchanged. This is deliberately a small
// change to a model whose behaviour is already measured, so that the
// analytics comparison by modelVersion means something.

const MODEL_VERSION_V1 = "baseline-v1";

/**
 * How many completed consultations of one visit type are needed before
 * that type's own median is trusted.
 *
 * Matches v0's tiering, which already refuses a doctor-level median below
 * five samples. A type median computed from one or two visits is noise,
 * and acting on noise is worse than falling back to the overall median,
 * which is at least stable.
 */
export const MIN_TYPE_SAMPLES = 5;

/** A visit type that has no distribution of its own — see the schema. */
const UNTYPED = "UNSPECIFIED";

export interface TypedPredictionInput extends Omit<PredictionInput, "tokensAhead"> {
  /** Visit types of the patients ahead, in the order they'll be seen. */
  aheadVisitTypes: string[];
  /** The visit type of the patient currently in consult, if any. */
  currentVisitType: string | null;
  /** Completed durations from the doctor's last 30 days, grouped by visit type. */
  durationsSecondsByType: Record<string, number[]>;
}

export interface TypedPredictionOutput extends PredictionOutput {
  /** The service time used for each visit type, for explainability. */
  serviceSecondsByType: Record<string, number>;
}

/**
 * Expected service seconds for one visit type.
 *
 * Falls back to the overall median whenever the type is unknown or has too
 * little history — so a clinic that has just started recording types gets
 * exactly v0's behaviour, and improves as evidence accumulates rather than
 * on the day the column was added.
 */
function serviceSecondsForType(visitType: string, overallMedianSeconds: number, durationsByType: Record<string, number[]>): number {
  if (visitType === UNTYPED) return overallMedianSeconds;
  const samples = durationsByType[visitType] ?? [];
  if (samples.length < MIN_TYPE_SAMPLES) return overallMedianSeconds;
  return median(samples);
}

export function predictBaselineV1(input: TypedPredictionInput): TypedPredictionOutput {
  // The overall median, computed by v0's own tiering. It remains both the
  // fallback for thinly-evidenced types and the figure reported on the
  // snapshot, so v0 and v1 rows stay comparable.
  const overallMedianSeconds = computeMedianServiceSeconds({ ...input, tokensAhead: input.aheadVisitTypes.length });

  const serviceSecondsByType: Record<string, number> = {};
  for (const visitType of new Set([...input.aheadVisitTypes, input.currentVisitType ?? UNTYPED])) {
    serviceSecondsByType[visitType] = serviceSecondsForType(visitType, overallMedianSeconds, input.durationsSecondsByType);
  }

  // The patient in the chair is measured against their OWN type's
  // expected length, not the average one. Sitting through a procedure
  // while the model thinks it is a follow-up is how a prediction ends up
  // confidently wrong.
  const currentServiceSeconds = serviceSecondsForType(
    input.currentVisitType ?? UNTYPED,
    overallMedianSeconds,
    input.durationsSecondsByType,
  );
  const elapsedSeconds = input.currentConsultStartedAt
    ? (input.now.getTime() - input.currentConsultStartedAt.getTime()) / 1000
    : 0;
  const remainingCurrentSeconds = input.currentConsultStartedAt ? Math.max(0, currentServiceSeconds - elapsedSeconds) : 0;

  // The one real change from v0: a sum, not a multiplication.
  const aheadSeconds = input.aheadVisitTypes.reduce(
    (total, visitType) => total + serviceSecondsForType(visitType, overallMedianSeconds, input.durationsSecondsByType),
    0,
  );

  const workSeconds = remainingCurrentSeconds + aheadSeconds;
  const predictedStartAt = skipBreaks(input.now, workSeconds, input.breaks);

  const etaSeconds = (predictedStartAt.getTime() - input.now.getTime()) / 1000;
  const windowStartAt = pushPastAnyBreak(
    new Date(predictedStartAt.getTime() - Math.max(300, 0.15 * etaSeconds) * 1000),
    input.breaks,
  );
  const windowEndAt = new Date(predictedStartAt.getTime() + Math.max(600, 0.35 * etaSeconds) * 1000);

  return {
    modelVersion: MODEL_VERSION_V1,
    predictedStartAt,
    windowStartAt,
    windowEndAt,
    medianServiceSeconds: overallMedianSeconds,
    serviceSecondsByType,
  };
}
