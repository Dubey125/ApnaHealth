import { z } from "zod";

// Amending a consultation record.
//
// Records were create-once and permanent: a doctor who typed the wrong
// diagnosis was stuck with it forever. That is not a safe place to leave a
// medical record, and the fix is not an edit button.
//
// ─────────────────────────────────────────────────────────────────────
// THE RULE: NEVER OVERWRITE, ALWAYS APPEND
//
// The original entry is never altered and never deleted. An amendment is a
// new, separately attributed statement that sits alongside it, and BOTH
// stay readable.
//
// This is not caution for its own sake. A medical record is evidence: of
// what a clinician believed at the time, on the information they had. If a
// later correction could quietly replace the original, nobody could tell
// afterwards what was actually written during the consultation — which is
// exactly the question that matters when care is reviewed, and the reason
// paper records are corrected with a dated, signed line rather than an
// eraser.
//
// So there is no merged "current value" computed anywhere in this module.
// A reader sees the record as written, then each correction in order. That
// is more honest than a merge, and simpler.
// ─────────────────────────────────────────────────────────────────────

/** The fields an amendment may restate. */
export const AMENDABLE_FIELDS = [
  "chiefComplaint",
  "clinicalAssessment",
  "diagnosisText",
  "followUpInstructions",
] as const;

export type AmendableField = (typeof AMENDABLE_FIELDS)[number];

export const FIELD_LABELS: Record<AmendableField, string> = {
  chiefComplaint: "Chief complaints",
  clinicalAssessment: "Clinical assessment",
  diagnosisText: "Diagnosis",
  followUpInstructions: "Advice & follow-up",
};

const optionalText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const amendmentSchema = z
  .object({
    // Required, and the reason a record can be trusted after it changes.
    // "Corrected" is not a reason; the person reading this in a year needs
    // to know WHY, and the field is the only place that can say.
    reason: z.string().trim().min(5, "Say why this record is being amended.").max(500),
    chiefComplaint: optionalText,
    clinicalAssessment: optionalText,
    diagnosisText: optionalText,
    followUpInstructions: optionalText,
    // Covers what the structured fields cannot. A prescription that has
    // already been printed and handed over cannot be un-issued, so the
    // honest correction is a note saying what it should have read — not a
    // silent rewrite of a sheet the patient is holding.
    note: optionalText,
  })
  .refine(
    (value) =>
      Boolean(value.note) || AMENDABLE_FIELDS.some((field) => value[field] !== undefined),
    { message: "Restate at least one field, or add a note describing the correction.", path: ["note"] },
  );

export type AmendmentInput = z.infer<typeof amendmentSchema>;

export interface AmendmentRecord {
  id: string;
  amendedAt: Date;
  reason: string;
  note: string | null;
  chiefComplaint: string | null;
  clinicalAssessment: string | null;
  diagnosisText: string | null;
  followUpInstructions: string | null;
}

export interface AmendedField {
  field: AmendableField;
  label: string;
  value: string;
}

/**
 * The fields this amendment actually restated.
 *
 * Only non-null ones. An amendment that corrected a diagnosis says nothing
 * about the chief complaint, and rendering an empty row for it would imply
 * the amender reviewed and cleared it.
 */
export function amendedFields(amendment: AmendmentRecord): AmendedField[] {
  return AMENDABLE_FIELDS.filter((field) => amendment[field] !== null).map((field) => ({
    field,
    label: FIELD_LABELS[field],
    value: amendment[field] as string,
  }));
}

/**
 * Whether a field has been restated by any amendment.
 *
 * Used to mark the ORIGINAL value as superseded where it is displayed —
 * not to hide it. A reader must still see what was first written; they
 * just need to know it was later corrected, or they will act on a value
 * the record itself no longer stands behind.
 */
export function supersededFields(amendments: AmendmentRecord[]): Set<AmendableField> {
  const superseded = new Set<AmendableField>();
  for (const amendment of amendments) {
    for (const { field } of amendedFields(amendment)) superseded.add(field);
  }
  return superseded;
}

/** Oldest first: corrections read in the order they were made. */
export function inOrder(amendments: AmendmentRecord[]): AmendmentRecord[] {
  return [...amendments].sort((a, b) => a.amendedAt.getTime() - b.amendedAt.getTime());
}

/**
 * Whether a doctor may amend this record.
 *
 * Only its author. A different clinician who disagrees should write their
 * own record rather than restate someone else's — an amendment carries the
 * authority of the person who made the original entry, and letting anyone
 * edit anyone's notes would destroy that.
 *
 * Deliberately takes ids rather than objects so it stays a pure rule that
 * can be tested, and so no caller can pass a half-loaded record and have
 * it pass by accident.
 */
export function canAmend(recordDoctorId: string, viewerDoctorId: string | null): boolean {
  return viewerDoctorId !== null && recordDoctorId === viewerDoctorId;
}
