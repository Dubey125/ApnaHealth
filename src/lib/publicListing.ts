import type { Prisma } from "@/generated/prisma/client";

// The single definition of "visible to the public".
//
// Anyone can create a Clinic and a Doctor from the /register pages, so a
// row existing is not the same as a row being listed: a facility is listed
// only once the ApnaHealth review team has approved it. That is a rule
// every public query must apply, and the way such rules get broken is a
// new page written months later that forgets one clause — so the clause
// lives here, in one place, instead of being retyped per page.
//
// isActive and approvalStatus are deliberately separate: isActive is the
// facility's own switch (temporarily closed), approvalStatus is our
// decision about them. Both must hold.
export const LISTED_CLINIC = {
  isActive: true,
  approvalStatus: "APPROVED",
} as const satisfies Prisma.ClinicWhereInput;

export const LISTED_DOCTOR = {
  isActive: true,
  clinic: LISTED_CLINIC,
} as const satisfies Prisma.DoctorWhereInput;

// For a Session or Token reached by its own public id. Applied on top of
// the row's own lookup, so a link to a session at an unapproved facility
// 404s rather than quietly rendering a bookable page.
export const LISTED_SESSION = {
  clinic: LISTED_CLINIC,
  doctor: { isActive: true },
} as const satisfies Prisma.SessionWhereInput;
