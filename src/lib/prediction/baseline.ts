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
