import { prisma } from "@/lib/db";
import { predictBaselineV0, type BreakInterval, type PredictionOutput } from "./baseline";

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

// Computes a fresh baseline-v0 prediction for a waiting (BOOKED or
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

  const [tokensAheadCount, currentInConsult, sessionRecentCompleted, doctorRecentCompleted, breaks] = await Promise.all([
    prisma.token.count({
      where: { sessionId: session.id, status: "CHECKED_IN", tokenNumber: { lt: token.tokenNumber } },
    }),
    prisma.token.findFirst({ where: { sessionId: session.id, status: "IN_CONSULT" } }),
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

  const output = predictBaselineV0({
    now,
    tokensAhead: tokensAheadCount,
    currentConsultStartedAt: currentInConsult?.consultStartedAt ?? null,
    sessionRecentDurationsSeconds: sessionRecentCompleted.map((t) => durationSeconds(t.consultStartedAt!, t.consultEndedAt!)),
    doctorRecentDurationsSeconds: doctorRecentCompleted.map((t) => durationSeconds(t.consultStartedAt!, t.consultEndedAt!)),
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
      tokensAhead: tokensAheadCount,
      medianServiceSeconds: Math.round(output.medianServiceSeconds),
    },
  });

  const relevantBreak =
    breaks
      .map((b) => ({ startAt: b.startAt, endAt: b.endAt }))
      .filter((b) => b.startAt.getTime() <= output.windowEndAt.getTime())
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null;

  return { ...output, tokensAhead: tokensAheadCount, relevantBreak };
}
