"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { loadTokenForDoctorRecord } from "@/lib/records/loadTokenForDoctorRecord";
import { emptyToUndefined } from "@/lib/records/access";
import { hasAnyVital, toStoredVitals, vitalsSchema } from "@/lib/records/vitals";
import { allergyInputSchema, isDuplicateSubstance } from "@/lib/records/allergies";
import { parseMedicines, withPositions } from "@/lib/records/prescription";
import { amendmentSchema, canAmend } from "@/lib/records/amendments";

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

  // Vitals are parsed separately so their own validation messages survive.
  // "Systolic must be higher than diastolic" tells a clinician what to fix;
  // folding it into a generic "Invalid request." would not, and a form that
  // refuses without saying why is a form people stop filling in.
  const parsedVitals = vitalsSchema.safeParse({
    bloodPressureSystolic: formData.get("bloodPressureSystolic"),
    bloodPressureDiastolic: formData.get("bloodPressureDiastolic"),
    pulseBpm: formData.get("pulseBpm"),
    temperatureF: formData.get("temperatureF"),
    spo2Percent: formData.get("spo2Percent"),
    weightKg: formData.get("weightKg"),
  });
  if (!parsedVitals.success) {
    return { error: parsedVitals.error.issues[0]?.message ?? "Check the recorded vitals." };
  }
  const vitals = toStoredVitals(parsedVitals.data);

  // Medicine rows travel as JSON in a hidden field, so they are untrusted
  // browser input like anything else — parsed, schema-validated and
  // bounded before they go near the database.
  const medicines = parseMedicines(formData.get("medicines"));
  if (!medicines.ok) {
    return { error: medicines.error };
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
  const hasContent =
    [
      parsed.data.chiefComplaint,
      parsed.data.clinicalAssessment,
      parsed.data.diagnosisText,
      parsed.data.prescriptionText,
      parsed.data.followUpInstructions,
    ].some((value) => emptyToUndefined(value) !== undefined) ||
    // A visit where only observations were taken is a real record. Before
    // vitals were structured they counted as content only because they had
    // been pasted into the assessment text.
    hasAnyVital(vitals) ||
    // A consultation whose only output was a prescription is a real
    // record. Before medicines were structured this counted as content
    // only because the rows had been stringified into prescriptionText.
    medicines.medicines.length > 0;
  if (!hasContent) {
    return { error: "Record at least one detail before saving — this cannot be edited afterwards." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const record = await tx.consultationRecord.create({
      data: {
        patientId,
        doctorId: session.doctorId,
        clinicId: clinicSession.clinicId,
        tokenId: token.id,
        consultedAt: now,
        ...vitals,
        chiefComplaint: emptyToUndefined(parsed.data.chiefComplaint),
        clinicalAssessment: emptyToUndefined(parsed.data.clinicalAssessment),
        diagnosisText: emptyToUndefined(parsed.data.diagnosisText),
        prescriptionText: emptyToUndefined(parsed.data.prescriptionText),
        followUpInstructions: emptyToUndefined(parsed.data.followUpInstructions),
      },
    });

    if (medicines.medicines.length > 0) {
      await tx.prescribedMedicine.createMany({
        data: withPositions(medicines.medicines).map((medicine) => ({
          consultationRecordId: record.id,
          position: medicine.position,
          name: medicine.name,
          dosage: medicine.dosage,
          timing: medicine.timing,
          duration: medicine.duration,
          notes: medicine.notes,
        })),
      });
    }

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

// --- Allergies ---
//
// Clinician-authored, like consultation records: loadTokenForDoctorRecord
// proves the caller is a doctor, on their own session, treating this
// patient right now. Front-desk staff deliberately cannot record an
// allergy — second-hand allergy data entered at a counter is a known
// safety problem, and a wrong entry here is worse than an absent one.
//
// Nothing in any of these actions compares an allergy to a prescription.
// See the note at the top of src/lib/records/allergies.ts.

const tokenRefSchema = z.object({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
});

const recordAllergySchema = allergyInputSchema.extend({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
});

export async function recordPatientAllergy(
  _prevState: RecordActionState,
  formData: FormData,
): Promise<RecordActionState> {
  const parsed = recordAllergySchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
    substance: formData.get("substance"),
    reaction: formData.get("reaction") ?? undefined,
    severity: formData.get("severity") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the allergy details." };
  }

  const { session, clinicSession, token } = await loadTokenForDoctorRecord(parsed.data.sessionId, parsed.data.tokenId);
  if (!token.patientId) {
    return { error: "This visit has no linked patient account." };
  }
  const patientId = token.patientId;

  const existing = await prisma.patientAllergy.findMany({ where: { patientId } });
  if (isDuplicateSubstance(parsed.data.substance, existing)) {
    return { error: `${parsed.data.substance.trim()} is already recorded for this patient.` };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.patientAllergy.create({
      data: {
        patientId,
        clinicId: clinicSession.clinicId,
        doctorId: session.doctorId,
        substance: parsed.data.substance,
        reaction: parsed.data.reaction,
        severity: parsed.data.severity,
        recordedAt: now,
      },
    });

    // Recording an allergy is itself evidence that someone asked, so the
    // patient stops being "not asked" even if this is the only entry.
    await tx.patient.update({
      where: { id: patientId },
      data: { allergiesReviewedAt: now, allergiesReviewedByDoctorId: session.doctorId },
    });

    await tx.recordAccessEvent.create({
      data: {
        patientId,
        clinicId: clinicSession.clinicId,
        doctorId: session.doctorId,
        staffUserId: session.staffUserId,
        action: "CREATE",
        reason: "Allergy recorded",
        occurredAt: now,
      },
    });
  });

  revalidatePath(`/app/queue/${clinicSession.id}/token/${token.id}/record`);
  return {};
}

/**
 * Record that allergies were asked about and none are known.
 *
 * A real clinical finding, not an absence of one — which is exactly why it
 * needs its own action rather than being inferred from an empty list.
 */
export async function confirmNoKnownAllergies(
  _prevState: RecordActionState,
  formData: FormData,
): Promise<RecordActionState> {
  const parsed = tokenRefSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const { session, clinicSession, token } = await loadTokenForDoctorRecord(parsed.data.sessionId, parsed.data.tokenId);
  if (!token.patientId) return { error: "This visit has no linked patient account." };
  const patientId = token.patientId;

  const active = await prisma.patientAllergy.count({ where: { patientId, retractedAt: null } });
  if (active > 0) {
    // Refusing rather than silently retracting: withdrawing a recorded
    // allergy is a separate, deliberate act with its own reason.
    return { error: "This patient has recorded allergies. Withdraw them individually if they no longer apply." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.patient.update({
      where: { id: patientId },
      data: { allergiesReviewedAt: now, allergiesReviewedByDoctorId: session.doctorId },
    }),
    prisma.recordAccessEvent.create({
      data: {
        patientId,
        clinicId: clinicSession.clinicId,
        doctorId: session.doctorId,
        staffUserId: session.staffUserId,
        action: "UPDATE",
        reason: "No known allergies confirmed",
        occurredAt: now,
      },
    }),
  ]);

  revalidatePath(`/app/queue/${clinicSession.id}/token/${token.id}/record`);
  return {};
}

const retractAllergySchema = z.object({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
  allergyId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a short reason for withdrawing this allergy.").max(200),
});

/**
 * Withdraw an allergy that no longer stands.
 *
 * Never a delete. The row is retracted with a reason and stays in the
 * record — "this was recorded and later withdrawn" is clinically
 * meaningful, and removing it would leave the next doctor unable to tell
 * whether it had ever been there.
 */
export async function retractPatientAllergy(
  _prevState: RecordActionState,
  formData: FormData,
): Promise<RecordActionState> {
  const parsed = retractAllergySchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
    allergyId: formData.get("allergyId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const { session, clinicSession, token } = await loadTokenForDoctorRecord(parsed.data.sessionId, parsed.data.tokenId);
  if (!token.patientId) return { error: "This visit has no linked patient account." };

  const allergy = await prisma.patientAllergy.findUnique({ where: { id: parsed.data.allergyId } });
  // Scoped to the patient being treated, so an allergy id belonging to
  // another patient cannot be withdrawn by guessing it.
  if (!allergy || allergy.patientId !== token.patientId) {
    return { error: "Allergy not found for this patient." };
  }
  if (allergy.retractedAt) return { error: "This allergy has already been withdrawn." };

  const now = new Date();
  await prisma.$transaction([
    prisma.patientAllergy.update({
      where: { id: allergy.id },
      data: { retractedAt: now, retractedReason: parsed.data.reason, retractedByDoctorId: session.doctorId },
    }),
    prisma.recordAccessEvent.create({
      data: {
        patientId: token.patientId,
        clinicId: clinicSession.clinicId,
        doctorId: session.doctorId,
        staffUserId: session.staffUserId,
        action: "UPDATE",
        reason: "Allergy withdrawn",
        occurredAt: now,
      },
    }),
  ]);

  revalidatePath(`/app/queue/${clinicSession.id}/token/${token.id}/record`);
  return {};
}

// --- Amendments ---
//
// NEVER OVERWRITE, ALWAYS APPEND. Nothing here updates the original
// ConsultationRecord row; an amendment is an inserted statement alongside
// it. See src/lib/records/amendments.ts for why.

const amendRecordSchema = amendmentSchema.safeExtend({
  sessionId: z.string().min(1),
  tokenId: z.string().min(1),
  recordId: z.string().min(1),
});

export async function amendConsultationRecord(
  _prevState: RecordActionState,
  formData: FormData,
): Promise<RecordActionState> {
  const parsed = amendRecordSchema.safeParse({
    sessionId: formData.get("sessionId"),
    tokenId: formData.get("tokenId"),
    recordId: formData.get("recordId"),
    reason: formData.get("reason"),
    chiefComplaint: formData.get("chiefComplaint") ?? undefined,
    clinicalAssessment: formData.get("clinicalAssessment") ?? undefined,
    diagnosisText: formData.get("diagnosisText") ?? undefined,
    followUpInstructions: formData.get("followUpInstructions") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the amendment." };
  }

  const { session, clinicSession, token } = await loadTokenForDoctorRecord(parsed.data.sessionId, parsed.data.tokenId);

  const record = await prisma.consultationRecord.findUnique({ where: { id: parsed.data.recordId } });
  // Scoped to the token being viewed, so a record id belonging to another
  // patient cannot be amended by guessing it.
  if (!record || record.tokenId !== token.id) {
    return { error: "Record not found for this visit." };
  }
  if (!canAmend(record.doctorId, session.doctorId)) {
    // A different clinician who disagrees writes their own record. An
    // amendment carries the authority of whoever made the original entry.
    return { error: "Only the doctor who wrote this record can amend it." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.consultationRecordAmendment.create({
      data: {
        consultationRecordId: record.id,
        doctorId: session.doctorId,
        amendedAt: now,
        reason: parsed.data.reason,
        chiefComplaint: parsed.data.chiefComplaint,
        clinicalAssessment: parsed.data.clinicalAssessment,
        diagnosisText: parsed.data.diagnosisText,
        followUpInstructions: parsed.data.followUpInstructions,
        note: parsed.data.note,
      },
    }),
    prisma.recordAccessEvent.create({
      data: {
        patientId: record.patientId,
        clinicId: clinicSession.clinicId,
        doctorId: session.doctorId,
        staffUserId: session.staffUserId,
        action: "UPDATE",
        reason: "Consultation record amended",
        occurredAt: now,
      },
    }),
  ]);

  revalidatePath(`/app/queue/${clinicSession.id}/token/${token.id}/record`);
  return {};
}
