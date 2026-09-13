import { z } from "zod";
import type { AllergySeverity } from "@/generated/prisma/enums";

// Patient allergies.
//
// Until now there was nowhere to record that a patient reacts badly to
// penicillin, while the prescription box sat on the same screen. That is a
// gap in the record, and this closes it.
//
// ─────────────────────────────────────────────────────────────────────
// THE DISTINCTION THAT MATTERS MOST
//
// "No known allergies" and "nobody has asked" look identical in an empty
// list, and they are completely different clinical facts. One is a
// negative finding a clinician established; the other is an absence of
// information. Treating the second as the first is how a system creates
// false confidence — a doctor glances at a blank allergy panel, reads it
// as "cleared", and prescribes.
//
// So the two are modelled separately: Patient.allergiesReviewedAt records
// that someone actually asked, independently of whether anything was
// found. An empty list with no review date says NOT ASKED, in those words.
// ─────────────────────────────────────────────────────────────────────
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// It does not check prescriptions against allergies. There is no
// interaction checking, no contraindication warning, no matching of a
// drug name to a recorded substance, and no alert of any kind.
//
// That is clinical decision support, and CLAUDE.md's safety boundary puts
// clinical decisions with the clinician. The product's job here is to put
// the allergy in front of the person writing the prescription, legibly and
// unmissably, and then get out of the way.

export const ALLERGY_SEVERITIES: AllergySeverity[] = ["UNKNOWN", "MILD", "MODERATE", "SEVERE"];

export const SEVERITY_LABELS: Record<AllergySeverity, string> = {
  UNKNOWN: "Severity not recorded",
  MILD: "Mild",
  MODERATE: "Moderate",
  SEVERE: "Severe",
};

/**
 * What is known about this patient's allergies.
 *
 * Three states, not two — see the note above.
 */
export type AllergyStatus = "NOT_ASKED" | "NONE_KNOWN" | "KNOWN";

export interface AllergyRecord {
  id: string;
  substance: string;
  reaction: string | null;
  severity: AllergySeverity;
  recordedAt: Date;
  retractedAt: Date | null;
}

/** Allergies that still stand. A retracted one is history, not a warning. */
export function activeAllergies<T extends { retractedAt: Date | null }>(allergies: T[]): T[] {
  return allergies.filter((allergy) => allergy.retractedAt === null);
}

export function allergyStatus(allergies: AllergyRecord[], reviewedAt: Date | null): AllergyStatus {
  if (activeAllergies(allergies).length > 0) return "KNOWN";
  return reviewedAt ? "NONE_KNOWN" : "NOT_ASKED";
}

/**
 * Active allergies, most serious first, then most recently recorded.
 *
 * Ordering by recorded severity is not the software forming a clinical
 * opinion — the severity is whatever the clinician selected, and putting
 * their own "SEVERE" at the top of their own list is presenting their
 * record back to them faithfully. Nothing here infers a severity, changes
 * one, or derives it from the substance.
 */
const SEVERITY_ORDER: Record<AllergySeverity, number> = { SEVERE: 0, MODERATE: 1, MILD: 2, UNKNOWN: 3 };

export function orderedAllergies<T extends AllergyRecord>(allergies: T[]): T[] {
  return activeAllergies(allergies).sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.recordedAt.getTime() - a.recordedAt.getTime(),
  );
}

/**
 * A one-line summary for places with no room for a list.
 *
 * Never returns an empty string. A blank where an allergy summary should
 * be reads as "none", which is the misreading this whole module exists to
 * prevent.
 */
export function allergySummary(allergies: AllergyRecord[], reviewedAt: Date | null): string {
  const status = allergyStatus(allergies, reviewedAt);
  if (status === "NOT_ASKED") return "Allergies not recorded";
  if (status === "NONE_KNOWN") return "No known allergies";
  return orderedAllergies(allergies)
    .map((allergy) => allergy.substance)
    .join(", ");
}

export const allergyInputSchema = z.object({
  // A substance with no name is not a record of anything.
  substance: z.string().trim().min(2, "Name the substance the patient reacts to.").max(120),
  // Optional: a clinician who knows the substance but not the reaction
  // should still be able to record the substance. Requiring both would
  // mean recording neither.
  reaction: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  // UNKNOWN is a real answer, and the default. Forcing a clinician to pick
  // a severity they have not established would manufacture certainty.
  severity: z.enum(["UNKNOWN", "MILD", "MODERATE", "SEVERE"]).default("UNKNOWN"),
});

export type AllergyInput = z.infer<typeof allergyInputSchema>;

/**
 * Whether this substance is already recorded for the patient.
 *
 * Compared case- and whitespace-insensitively, because "Penicillin" and
 * "penicillin " are the same allergy and a duplicate entry makes a list
 * harder to read at exactly the moment it needs to be scanned quickly.
 * Retracted entries do not block re-recording — a patient can be found to
 * have an allergy that was previously withdrawn.
 */
export function isDuplicateSubstance(substance: string, existing: AllergyRecord[]): boolean {
  const normalised = substance.trim().toLowerCase();
  return activeAllergies(existing).some((allergy) => allergy.substance.trim().toLowerCase() === normalised);
}
