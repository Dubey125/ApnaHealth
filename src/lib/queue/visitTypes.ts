import type { VisitType } from "@/generated/prisma/enums";

// Labels for the visit types, and which of them a patient may pick for
// themselves.
//
// The front desk sees all of them. The public booking form deliberately
// does not offer PROCEDURE: a patient booking online knows whether they
// have seen this doctor before, but whether the visit is a procedure is a
// clinical judgement, and a wrong answer there would feed the prediction
// engine a 30-minute slot for a 5-minute consultation. Anything the
// patient cannot reasonably know stays with the clinic.

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  UNSPECIFIED: "Not recorded",
  NEW: "First visit",
  FOLLOW_UP: "Follow-up",
  PROCEDURE: "Procedure",
};

/** Offered at the counter, where staff know what the visit actually is. */
export const STAFF_VISIT_TYPES: VisitType[] = ["NEW", "FOLLOW_UP", "PROCEDURE"];

/** Offered to a patient booking their own appointment. */
export const PATIENT_VISIT_TYPES: VisitType[] = ["NEW", "FOLLOW_UP"];

export function visitTypeLabel(visitType: VisitType): string {
  return VISIT_TYPE_LABELS[visitType];
}

/** Whether this type is worth showing at all — UNSPECIFIED is absence, not a fact. */
export function hasVisitType(visitType: VisitType): boolean {
  return visitType !== "UNSPECIFIED";
}
