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

// --- Per-visit-type and per-model breakdowns ---
//
// Both exist for the same reason: baseline-v1 claims that separating
// visit types improves prediction, and a claim like that has to be
// checkable against the clinic's own data rather than taken on trust.
// If v1 is worse here, this is where it shows.

export interface TypedTokenMetricInput extends TokenMetricInput {
  visitType: string;
}

export interface VisitTypeDuration {
  visitType: string;
  medianSeconds: number | null;
  sampleSize: number;
}

/**
 * Median consultation duration per visit type, longest first.
 *
 * This is the evidence for whether splitting types was worth doing at
 * all: if a clinic's follow-ups and first visits take the same time,
 * baseline-v1 has nothing to offer them and the honest answer is to say
 * so rather than to claim an improvement.
 */
export function consultDurationByVisitType(tokens: TypedTokenMetricInput[]): VisitTypeDuration[] {
  const byType = new Map<string, TypedTokenMetricInput[]>();
  for (const token of tokens) {
    const bucket = byType.get(token.visitType);
    if (bucket) bucket.push(token);
    else byType.set(token.visitType, [token]);
  }

  return [...byType.entries()]
    .map(([visitType, group]) => {
      const stats = consultDurationStats(group);
      return { visitType, medianSeconds: stats.medianSeconds, sampleSize: stats.sampleSize };
    })
    .filter((row) => row.sampleSize > 0)
    .sort((a, b) => (b.medianSeconds ?? 0) - (a.medianSeconds ?? 0));
}

export interface ModelAccuracy extends PredictionAccuracy {
  modelVersion: string;
}

export interface VersionedPredictionEvalInput extends PredictionEvalInput {
  modelVersion: string;
}

/**
 * Prediction accuracy split by the model that produced each prediction.
 *
 * Snapshots carry the modelVersion that made them, so historical v0 rows
 * and new v1 rows can be compared on the same clinic's real queue. Sorted
 * by version so the ordering is stable rather than dependent on which
 * arrived first.
 *
 * Two caveats a reader has to hold: these are different time periods, not
 * a controlled experiment, and a version with a small sample size can
 * look better or worse than it is. Sample size is returned alongside for
 * exactly that reason — never report the rate without it.
 */
export function predictionAccuracyByModel(evals: VersionedPredictionEvalInput[]): ModelAccuracy[] {
  const byVersion = new Map<string, VersionedPredictionEvalInput[]>();
  for (const item of evals) {
    const bucket = byVersion.get(item.modelVersion);
    if (bucket) bucket.push(item);
    else byVersion.set(item.modelVersion, [item]);
  }

  return [...byVersion.entries()]
    .map(([modelVersion, group]) => ({ modelVersion, ...predictionAccuracy(group) }))
    .sort((a, b) => a.modelVersion.localeCompare(b.modelVersion));
}
