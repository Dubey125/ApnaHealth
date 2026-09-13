import { z } from "zod";

// Prescribed medicines, as rows instead of a paragraph.
//
// The consultation form has always built structured medicine rows — name,
// dose, timing, duration, note — and then flattened them into one string
// before saving:
//
//   1. Amoxicillin | Dose: 1-0-1 | Timing: After Food | Duration: 5 days
//
// Exactly the same mistake vitals made. The structure existed in the UI
// for the length of one form submission and was destroyed on the way to
// the database, so nothing downstream could count how often a drug is
// prescribed, repeat a prescription at follow-up, or lay one out properly
// on a printed sheet.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// It does not check a medicine against anything. No interaction checking,
// no allergy matching, no dose validation, no formulary, no substitution,
// no "did you mean". CLAUDE.md forbids autonomous prescribing and puts
// clinical decisions with the clinician; this module records what a doctor
// wrote and never has an opinion about it.
//
// In particular it does NOT compare a medicine to the patient's recorded
// allergies, even though both are now structured and sitting on the same
// screen. That comparison is clinical decision support and needs a
// separate, deliberate approval — not to be quietly enabled because the
// data finally lines up.

/** A medicine as the prescriber entered it. */
export interface PrescribedMedicineInput {
  name: string;
  dosage?: string;
  timing?: string;
  duration?: string;
  notes?: string;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

/**
 * One medicine.
 *
 * Only the name is required. A prescriber who has written a drug but not
 * yet a duration must still be able to save it — refusing would push them
 * back into free text, which is the format this replaces. Recording an
 * incomplete row honestly beats recording nothing in a structured way.
 */
export const medicineSchema = z.object({
  name: z.string().trim().min(1, "Name the medicine.").max(200),
  dosage: optionalText(80),
  timing: optionalText(120),
  duration: optionalText(80),
  notes: optionalText(300),
});

/**
 * A prescription is at most this many lines.
 *
 * Not a clinical limit — no view is expressed about how many medicines a
 * patient should be on. It is a bound on what one submission can create,
 * so a malformed or hostile payload cannot insert thousands of rows
 * against a single consultation.
 */
export const MAX_MEDICINES = 50;

export const prescriptionSchema = z.array(medicineSchema).max(MAX_MEDICINES);

export type Medicine = z.infer<typeof medicineSchema>;

/**
 * Parse the medicine list submitted with the consultation form.
 *
 * The rows travel as JSON in a hidden field, so this is untrusted input
 * from the browser like any other and gets the same treatment: parsed,
 * schema-validated, and bounded. A blank or absent field is an empty
 * prescription, not an error — plenty of consultations prescribe nothing.
 *
 * Rows with no medicine name are dropped rather than rejected. The form
 * starts with one empty row and lets the prescriber add more, so a
 * half-filled trailing row is the normal shape of a finished form, not a
 * mistake worth blocking a save over.
 */
export function parseMedicines(raw: FormDataEntryValue | null): { ok: true; medicines: Medicine[] } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: true, medicines: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Could not read the prescription. Re-enter the medicines and try again." };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Could not read the prescription. Re-enter the medicines and try again." };
  }

  const named = parsed.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && typeof (row as { name?: unknown }).name === "string" &&
      ((row as { name: string }).name).trim().length > 0,
  );

  const result = prescriptionSchema.safeParse(named);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Check the prescribed medicines." };
  }
  return { ok: true, medicines: result.data };
}

/**
 * Number the medicines in the order the prescriber listed them.
 *
 * Order is part of a prescription — a doctor writes the primary drug
 * first — so it is stored rather than left to whatever order rows come
 * back from the database in.
 *
 * Generic over the row shape: Zod's transform makes the optional fields
 * present-but-undefined, so pinning this to the parse output would refuse
 * a plain `{ name }` and force every caller to spell out four undefineds.
 */
export function withPositions<T extends { name: string }>(medicines: T[]): (T & { position: number })[] {
  return medicines.map((medicine, index) => ({ ...medicine, position: index }));
}

export interface DisplayMedicine {
  name: string;
  /** Dose, timing and duration joined for a single line. Empty if none given. */
  instructions: string;
  notes: string | null;
}

/**
 * One medicine as a reader sees it.
 *
 * Absent parts are omitted rather than rendered as a placeholder: a
 * prescription line reading "Dose: —" invites being read as a dose that
 * was considered and left blank, when it simply was not recorded.
 */
export function displayMedicine(medicine: {
  name: string;
  dosage: string | null;
  timing: string | null;
  duration: string | null;
  notes: string | null;
}): DisplayMedicine {
  return {
    name: medicine.name,
    instructions: [medicine.dosage, medicine.timing, medicine.duration].filter(Boolean).join(" · "),
    notes: medicine.notes,
  };
}

/**
 * The legacy free-text prescription, for records written before medicines
 * were structured.
 *
 * Those records are deliberately NOT parsed into rows: splitting a
 * clinician's prescription text back into drugs and doses means guessing
 * at a prescription, and a wrong guess is a wrong drug in a medical
 * record. They keep their text and are shown as written.
 */
export function hasStructuredMedicines(medicines: unknown[]): boolean {
  return medicines.length > 0;
}
