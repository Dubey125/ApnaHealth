import type { TokenStatus } from "@/generated/prisma/enums";

const ALL_TOKEN_STATUSES: TokenStatus[] = ["BOOKED", "CHECKED_IN", "IN_CONSULT", "COMPLETED", "NO_SHOW", "CANCELLED"];

export interface TokenMetricInput {
  status: TokenStatus;
  checkedInAt: Date | null;
  consultStartedAt: Date | null;
  consultEndedAt: Date | null;
}

export interface TokenCounts {
  total: number;
  byStatus: Record<TokenStatus, number>;
}

export function tokenCounts(tokens: TokenMetricInput[]): TokenCounts {
  const byStatus = Object.fromEntries(ALL_TOKEN_STATUSES.map((status) => [status, 0])) as Record<TokenStatus, number>;
  for (const token of tokens) {
    byStatus[token.status] += 1;
  }
  return { total: tokens.length, byStatus };
}

// Excludes CANCELLED: a patient who proactively cancels isn't a no-show.
// Denominator is tokens that reached a known outcome (seen or didn't
// show), not every token ever issued.
export function noShowRate(tokens: TokenMetricInput[]): number | null {
  const completed = tokens.filter((t) => t.status === "COMPLETED").length;
  const noShow = tokens.filter((t) => t.status === "NO_SHOW").length;
  const denominator = completed + noShow;
  return denominator === 0 ? null : noShow / denominator;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

export interface WaitTimeStats {
  medianSeconds: number | null;
  p90Seconds: number | null;
  sampleSize: number;
}

export function waitTimeStats(tokens: TokenMetricInput[]): WaitTimeStats {
  const waits = tokens
    .filter((t): t is TokenMetricInput & { checkedInAt: Date; consultStartedAt: Date } => !!t.checkedInAt && !!t.consultStartedAt)
    .map((t) => (t.consultStartedAt.getTime() - t.checkedInAt.getTime()) / 1000)
    .filter((seconds) => seconds >= 0);
  return { medianSeconds: median(waits), p90Seconds: percentile(waits, 90), sampleSize: waits.length };
}

export interface ConsultDurationStats {
  medianSeconds: number | null;
  sampleSize: number;
}

export function consultDurationStats(tokens: TokenMetricInput[]): ConsultDurationStats {
  const durations = tokens
    .filter(
      (t): t is TokenMetricInput & { consultStartedAt: Date; consultEndedAt: Date } =>
        t.status === "COMPLETED" && !!t.consultStartedAt && !!t.consultEndedAt,
    )
    .map((t) => (t.consultEndedAt.getTime() - t.consultStartedAt.getTime()) / 1000)
    .filter((seconds) => seconds >= 0);
  return { medianSeconds: median(durations), sampleSize: durations.length };
}

export interface PredictionEvalInput {
  predictedStartAt: Date;
  windowStartAt: Date;
  windowEndAt: Date;
  actualStartAt: Date;
}

export interface PredictionAccuracy {
  medianAbsErrorSeconds: number | null;
  windowHitRate: number | null;
  sampleSize: number;
}

// Evaluated against each token's LAST snapshot before the consult
// actually started — the most-informed prediction the patient would have
// seen (QUEUE_RULES.md's baseline is explicitly re-snapshotted over time,
// e.g. as breaks shift it).
export function predictionAccuracy(evals: PredictionEvalInput[]): PredictionAccuracy {
  if (evals.length === 0) {
    return { medianAbsErrorSeconds: null, windowHitRate: null, sampleSize: 0 };
  }
  const errors = evals.map((e) => Math.abs(e.actualStartAt.getTime() - e.predictedStartAt.getTime()) / 1000);
  const hits = evals.filter((e) => e.actualStartAt >= e.windowStartAt && e.actualStartAt <= e.windowEndAt).length;
  return { medianAbsErrorSeconds: median(errors), windowHitRate: hits / evals.length, sampleSize: evals.length };
}
