"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { loadTokenForDoctorRecord } from "@/lib/records/loadTokenForDoctorRecord";
import { emptyToUndefined } from "@/lib/records/access";

export interface RecordActionState {
  error?: string;
}

const createRecordSchema = z.object({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
  chiefComplaint: z.string().optional(),
  clinicalAssessment: z.string().optional(),
  diagnosisText: z.string().optional(),
  prescriptionText: z.string().optional(),
  followUpInstructions: z.string().optional(),
});

// Clinician-authored only (ACCESS_MATRIX.md: "Create consultation record"
// is Doctor-only) and one record per visit — resubmitting once a record
// already exists for this token is rejected rather than silently
// overwriting it (no update capability in this MVP).
export async function createConsultationRecord(
  _prevState: RecordActionState,
  formData: FormData,
): Promise<RecordActionState> {
  const parsed = createRecordSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
    chiefComplaint: formData.get("chiefComplaint") ?? undefined,
    clinicalAssessment: formData.get("clinicalAssessment") ?? undefined,
    diagnosisText: formData.get("diagnosisText") ?? undefined,
    prescriptionText: formData.get("prescriptionText") ?? undefined,
    followUpInstructions: formData.get("followUpInstructions") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const { session, clinicSession, token } = await loadTokenForDoctorRecord(parsed.data.sessionId, parsed.data.tokenId);
  if (!token.patientId) {
    return { error: "This visit has no linked patient account." };
  }
  const patientId = token.patientId;

  const existing = await prisma.consultationRecord.findFirst({ where: { tokenId: token.id } });
  if (existing) {
    return { error: "A record already exists for this visit." };
  }

  // Every field is individually optional, but a record with none of them
  // filled in is a permanent, uneditable, empty clinical entry (there is
  // no update capability in this MVP) — worse than no record at all.
  const hasContent = [
    parsed.data.chiefComplaint,
    parsed.data.clinicalAssessment,
    parsed.data.diagnosisText,
    parsed.data.prescriptionText,
    parsed.data.followUpInstructions,
  ].some((value) => emptyToUndefined(value) !== undefined);
  if (!hasContent) {
    return { error: "Record at least one detail before saving — this cannot be edited afterwards." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.consultationRecord.create({
      data: {
        patientId,
        doctorId: session.doctorId,
        clinicId: clinicSession.clinicId,
        tokenId: token.id,
        consultedAt: now,
        chiefComplaint: emptyToUndefined(parsed.data.chiefComplaint),
        clinicalAssessment: emptyToUndefined(parsed.data.clinicalAssessment),
        diagnosisText: emptyToUndefined(parsed.data.diagnosisText),
        prescriptionText: emptyToUndefined(parsed.data.prescriptionText),
        followUpInstructions: emptyToUndefined(parsed.data.followUpInstructions),
      },
    });

    // Visit-scoped implicit consent: attending a booked consultation with
    // this doctor authorizes them to record it. A doctor's access to a
    // patient's OTHER visits is granted only where they have such a
    // consent row (see the page's history query) — there is no broader,
    // patient-granted consent UI in this MVP.
    const existingConsent = await tx.recordConsent.findFirst({ where: { tokenId: token.id } });
    if (!existingConsent) {
      await tx.recordConsent.create({
        data: {
          patientId,
          doctorId: session.doctorId,
          clinicId: clinicSession.clinicId,
          tokenId: token.id,
          grantedAt: now,
          scope: "consultation",
        },
      });
    }

    await tx.recordAccessEvent.create({
      data: {
        patientId,
        clinicId: clinicSession.clinicId,
        doctorId: session.doctorId,
        staffUserId: session.staffUserId,
        action: "CREATE",
        reason: "Consultation record authored",
        occurredAt: now,
      },
    });
  });

  revalidatePath(`/app/queue/${clinicSession.id}/token/${token.id}/record`);
  revalidatePath(`/app/queue/${clinicSession.id}`);
  return {};
}

const correctVisitTypeSchema = z.object({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
  // UNSPECIFIED is allowed on purpose. A doctor who can see the front desk
  // guessed wrong should be able to withdraw the guess rather than being
  // forced to substitute another one — "we don't know" is a truthful
  // answer, and the prediction handles it by falling back to the overall
  // median.
  visitType: z.enum(["UNSPECIFIED", "NEW", "FOLLOW_UP", "PROCEDURE"]),
});

/**
 * Correct the visit type recorded for this visit.
 *
 * The type is captured at the counter or by the patient when booking, and
 * both are guessing to a degree — the front desk from a phone call, the
 * patient from memory. The doctor is the one who knows what the
 * appointment actually was, and they know it at exactly the moment this
 * screen is in front of them.
 *
 * It is worth correcting because the visit type is not decoration: it is
 * the training data every future prediction reads. A procedure filed as a
 * follow-up drags the follow-up median upward for every follow-up patient
 * afterwards. One click here makes the next patient's estimate better.
 *
 * This does NOT rewrite history. PredictionSnapshot rows are what patients
 * were actually told and stay exactly as they were; only future
 * predictions, and the per-type medians they read, change.
 *
 * Not a medical record change, so it writes an AuditEvent rather than a
 * RecordAccessEvent — nothing clinical is read or written here.
 */
export async function correctVisitType(_prevState: RecordActionState, formData: FormData): Promise<RecordActionState> {
  const parsed = correctVisitTypeSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
    visitType: formData.get("visitType"),
  });
  if (!parsed.success) {
    return { error: "Choose a visit type." };
  }

  const { session, clinicSession, token } = await loadTokenForDoctorRecord(parsed.data.sessionId, parsed.data.tokenId);

  // Re-saving the same value is not an error, it just has nothing to do.
  if (token.visitType === parsed.data.visitType) {
    return {};
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.token.update({ where: { id: token.id }, data: { visitType: parsed.data.visitType } }),
    prisma.auditEvent.create({
      data: {
        clinicId: clinicSession.clinicId,
        actorUserId: session.staffUserId,
        action: "TOKEN_VISIT_TYPE_CORRECTED",
        entityType: "Token",
        entityId: token.id,
        occurredAt: now,
        // Operational metadata only. A visit type is how long an
        // appointment takes, not what is wrong with the patient — no
        // clinical content and no patient identifier goes in here.
        metadata: { from: token.visitType, to: parsed.data.visitType },
      },
    }),
  ]);

  revalidatePath(`/app/queue/${clinicSession.id}/token/${token.id}/record`);
  revalidatePath(`/app/queue/${clinicSession.id}`);
  return {};
}
