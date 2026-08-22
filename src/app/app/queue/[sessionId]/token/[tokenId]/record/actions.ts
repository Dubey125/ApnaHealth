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
