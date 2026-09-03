import { prisma } from "@/lib/db";
import {
  tokenCounts,
  noShowRate,
  waitTimeStats,
  consultDurationStats,
  predictionAccuracy,
  consultDurationByVisitType,
  predictionAccuracyByModel,
  type TokenCounts,
  type WaitTimeStats,
  type ConsultDurationStats,
  type PredictionAccuracy,
  type VersionedPredictionEvalInput,
  type VisitTypeDuration,
  type ModelAccuracy,
} from "./metrics";
import type { ReportRange } from "./range";

export interface ClinicReport {
  range: ReportRange;
  sampleSize: number;
  tokenCounts: TokenCounts;
  noShowRate: number | null;
  waitTime: WaitTimeStats;
  consultDuration: ConsultDurationStats;
  consultDurationByType: VisitTypeDuration[];
  prediction: PredictionAccuracy;
  /** Same accuracy, split by the model that produced each prediction. */
  predictionByModel: ModelAccuracy[];
}

interface LatestSnapshot {
  predictedStartAt: Date;
  windowStartAt: Date;
  windowEndAt: Date;
  modelVersion: string;
}

// One snapshot can be recalculated many times per token (e.g. a scheduled
// break shifting it) — evaluation uses only the last one, the most
// -informed prediction the patient would actually have seen.
async function latestSnapshotByToken(tokenIds: string[]): Promise<Map<string, LatestSnapshot>> {
  if (tokenIds.length === 0) return new Map();
  const snapshots = await prisma.predictionSnapshot.findMany({
    where: { tokenId: { in: tokenIds } },
    orderBy: { createdAt: "desc" },
    select: { tokenId: true, predictedStartAt: true, windowStartAt: true, windowEndAt: true, modelVersion: true },
  });
  const latest = new Map<string, LatestSnapshot>();
  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.tokenId)) {
      latest.set(snapshot.tokenId, snapshot);
    }
  }
  return latest;
}

// Owner-only full report, or a doctor-scoped "limited" report when
// doctorId is given (ACCESS_MATRIX.md: "View analytics" is Owner ✅,
// Doctor "limited"). Always clinic-scoped — never crosses tenant
// boundaries.
export async function buildClinicReport(clinicId: string, range: ReportRange, doctorId?: string): Promise<ClinicReport> {
  const tokens = await prisma.token.findMany({
    where: {
      session: { clinicId, ...(doctorId ? { doctorId } : {}) },
      issuedAt: { gte: range.from, lt: range.to },
    },
    select: { id: true, status: true, checkedInAt: true, consultStartedAt: true, consultEndedAt: true, visitType: true },
  });

  const startedTokenIds = tokens.filter((t) => t.consultStartedAt).map((t) => t.id);
  const latest = await latestSnapshotByToken(startedTokenIds);
  const predictionEvals: VersionedPredictionEvalInput[] = tokens
    .filter((t): t is typeof t & { consultStartedAt: Date } => !!t.consultStartedAt && latest.has(t.id))
    .map((t) => ({ ...latest.get(t.id)!, actualStartAt: t.consultStartedAt }));

  return {
    range,
    sampleSize: tokens.length,
    tokenCounts: tokenCounts(tokens),
    noShowRate: noShowRate(tokens),
    waitTime: waitTimeStats(tokens),
    consultDuration: consultDurationStats(tokens),
    consultDurationByType: consultDurationByVisitType(tokens),
    prediction: predictionAccuracy(predictionEvals),
    predictionByModel: predictionAccuracyByModel(predictionEvals),
  };
}

export interface AnonymizedVisitRow {
  [key: string]: string | number;
  sessionDate: string;
  doctorName: string;
  doctorSpecialty: string;
  tokenNumber: number;
  source: string;
  visitType: string;
  status: string;
  issuedAt: string;
  checkedInAt: string;
  consultStartedAt: string;
  consultEndedAt: string;
  waitSeconds: number | "";
  consultDurationSeconds: number | "";
  predictedStartAt: string;
  windowStartAt: string;
  windowEndAt: string;
  modelVersion: string;
  withinWindow: "true" | "false" | "";
}

// Anonymized research export: no patient name, phone, email, or medical
// free text (CLAUDE.md phase 10 spec) — deliberately excludes patientId,
// tokenId and publicId too, since they serve no research purpose here.
// Doctor identity is kept: it's already public (the doctor directory) and
// clinics need it to see which doctor's queue the numbers describe.
export async function buildAnonymizedRows(clinicId: string, range: ReportRange, doctorId?: string): Promise<AnonymizedVisitRow[]> {
  const tokens = await prisma.token.findMany({
    where: {
      session: { clinicId, ...(doctorId ? { doctorId } : {}) },
      issuedAt: { gte: range.from, lt: range.to },
    },
    include: { session: { select: { sessionDate: true, doctor: { select: { name: true, specialty: true } } } } },
    orderBy: [{ sessionId: "asc" }, { tokenNumber: "asc" }],
  });

  const latest = await latestSnapshotByToken(tokens.map((t) => t.id));

  return tokens.map((t): AnonymizedVisitRow => {
    const snapshot = latest.get(t.id) ?? null;
    const waitSeconds =
      t.checkedInAt && t.consultStartedAt ? Math.round((t.consultStartedAt.getTime() - t.checkedInAt.getTime()) / 1000) : "";
    const consultDurationSeconds =
      t.consultStartedAt && t.consultEndedAt ? Math.round((t.consultEndedAt.getTime() - t.consultStartedAt.getTime()) / 1000) : "";
    const withinWindow: AnonymizedVisitRow["withinWindow"] =
      snapshot && t.consultStartedAt
        ? t.consultStartedAt >= snapshot.windowStartAt && t.consultStartedAt <= snapshot.windowEndAt
          ? "true"
          : "false"
        : "";

    return {
      sessionDate: t.session.sessionDate.toISOString().slice(0, 10),
      doctorName: t.session.doctor.name,
      doctorSpecialty: t.session.doctor.specialty,
      tokenNumber: t.tokenNumber,
      source: t.source,
      visitType: t.visitType,
      status: t.status,
      issuedAt: t.issuedAt.toISOString(),
      checkedInAt: t.checkedInAt?.toISOString() ?? "",
      consultStartedAt: t.consultStartedAt?.toISOString() ?? "",
      consultEndedAt: t.consultEndedAt?.toISOString() ?? "",
      waitSeconds,
      consultDurationSeconds,
      predictedStartAt: snapshot?.predictedStartAt.toISOString() ?? "",
      windowStartAt: snapshot?.windowStartAt.toISOString() ?? "",
      windowEndAt: snapshot?.windowEndAt.toISOString() ?? "",
      modelVersion: snapshot?.modelVersion ?? "",
      withinWindow,
    };
  });
}
