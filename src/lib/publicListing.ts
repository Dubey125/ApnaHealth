import type { Prisma } from "@/generated/prisma/client";
import type { SessionStatus } from "@/generated/prisma/enums";

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

// A session the public may still take a token for. Status lives here with
// the rest of the listing rules rather than inline at each call site,
// because "can the public book this?" is one question with two halves —
// is the facility listed, and is the session open — and splitting them
// across two files is how the two got out of step in the first place.
export const BOOKABLE_SESSION_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

export function isBookableSessionStatus(status: SessionStatus): boolean {
  return (BOOKABLE_SESSION_STATUSES as readonly SessionStatus[]).includes(status);
}

// The complete public-booking gate, as a single where-clause.
//
// This exists because gating only the /book page was not enough: the page
// and its server action are independent entry points, the page hands the
// session's internal id to the browser in a hidden field, and the action
// re-read that id with nothing but a status check. A facility that was
// approved, shared its booking link, and was later REJECTED went on
// accepting public bookings through the action alone. An action must never
// infer its authorization from the page that rendered its form.
export function bookableSessionWhere(sessionId: string): Prisma.SessionWhereInput {
  return { id: sessionId, ...LISTED_SESSION };
}
