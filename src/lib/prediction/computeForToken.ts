import { prisma } from "@/lib/db";
import { predictBaselineV1, type BreakInterval, type PredictionOutput } from "./baseline";
import { QUEUE_ORDER_BY, servedBeforeWhere } from "@/lib/queue/ordering";
import type { VisitType } from "@/generated/prisma/enums";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function durationSeconds(startedAt: Date, endedAt: Date): number {
  return (endedAt.getTime() - startedAt.getTime()) / 1000;
}

// The algorithm's own output (PredictionOutput) is the locked contract
// baseline.test.ts asserts against. This wrapper adds two fields the
// patient-facing ticket page needs (PHASE-14) that computeForToken already
// has on hand from its own queries but previously discarded: how many
// people are ahead, and the nearest scheduled break that falls within the
// predicted window (so the UI can explain *why* the wait is what it is).
// Neither addition touches the prediction math, PredictionSnapshot
// writing, or QueueEvent semantics.
export interface TokenPrediction extends PredictionOutput {
  tokensAhead: number;
  relevantBreak: BreakInterval | null;
}

// Computes a fresh baseline-v1 prediction for a waiting (BOOKED or
// CHECKED_IN) token and records it as a PredictionSnapshot, per
// QUEUE_RULES.md ("write a PredictionSnapshot row each time a prediction
// is shown to a patient"). Returns null for a token that isn't currently
// waiting (already in consult or in a terminal state) — there's nothing
// meaningful to predict.
export async function computeAndSnapshotPrediction(tokenId: string): Promise<TokenPrediction | null> {
  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    include: { session: { include: { doctor: true } } },
  });
  if (!token || (token.status !== "BOOKED" && token.status !== "CHECKED_IN")) {
    return null;
  }

  const now = new Date();
  const { session } = token;

  const [tokensAhead, currentInConsult, sessionRecentCompleted, doctorRecentCompleted, breaks] = await Promise.all([
    // v1 needs to know WHAT each person ahead is here for, not merely how
    // many there are, so this reads their visit types instead of counting.
    // Effective queue order — see src/lib/queue/ordering.ts. Counting by
    // token number alone would let a prioritised patient with a high
    // number be treated as already past by everyone behind them.
    prisma.token.findMany({
      where: { sessionId: session.id, status: "CHECKED_IN", ...servedBeforeWhere(token) },
      orderBy: QUEUE_ORDER_BY,
      select: { visitType: true },
    }),
    prisma.token.findFirst({
      where: { sessionId: session.id, status: "IN_CONSULT" },
      select: { consultStartedAt: true, visitType: true },
    }),
    prisma.token.findMany({
      where: { sessionId: session.id, status: "COMPLETED", consultStartedAt: { not: null }, consultEndedAt: { not: null } },
      orderBy: { consultEndedAt: "desc" },
      take: 8,
    }),
    prisma.token.findMany({
      where: {
        session: { doctorId: session.doctorId },
        status: "COMPLETED",
        consultStartedAt: { not: null },
        // gte already excludes nulls (a NULL never satisfies a comparison)
        consultEndedAt: { gte: new Date(now.getTime() - THIRTY_DAYS_MS) },
      },
    }),
    prisma.sessionBreak.findMany({ where: { sessionId: session.id, endAt: { gt: now } } }),
  ]);

  // The doctor's own history, grouped by what kind of visit it was. Only
  // this doctor's: consultation length is a property of the clinician and
  // their practice, not of the visit type in the abstract.
  const durationsSecondsByType: Record<string, number[]> = {};
  for (const completed of doctorRecentCompleted) {
    const seconds = durationSeconds(completed.consultStartedAt!, completed.consultEndedAt!);
    (durationsSecondsByType[completed.visitType] ??= []).push(seconds);
  }

  const output = predictBaselineV1({
    now,
    aheadVisitTypes: tokensAhead.map((t) => t.visitType as VisitType),
    currentVisitType: currentInConsult?.visitType ?? null,
    currentConsultStartedAt: currentInConsult?.consultStartedAt ?? null,
    sessionRecentDurationsSeconds: sessionRecentCompleted.map((t) => durationSeconds(t.consultStartedAt!, t.consultEndedAt!)),
    doctorRecentDurationsSeconds: doctorRecentCompleted.map((t) => durationSeconds(t.consultStartedAt!, t.consultEndedAt!)),
    durationsSecondsByType,
    doctorDefaultMinutes: session.doctor.defaultConsultMinutes,
    breaks: breaks.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
  });

  await prisma.predictionSnapshot.create({
    data: {
      tokenId: token.id,
      sessionId: session.id,
      modelVersion: output.modelVersion,
      predictedStartAt: output.predictedStartAt,
      windowStartAt: output.windowStartAt,
      windowEndAt: output.windowEndAt,
      tokensAhead: tokensAhead.length,
      medianServiceSeconds: Math.round(output.medianServiceSeconds),
    },
  });

  const relevantBreak =
    breaks
      .map((b) => ({ startAt: b.startAt, endAt: b.endAt }))
      .filter((b) => b.startAt.getTime() <= output.windowEndAt.getTime())
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null;

  return { ...output, tokensAhead: tokensAhead.length, relevantBreak };
}
