import type { TokenStatus } from "@/generated/prisma/enums";
import type { BadgeVariant } from "@/components/ui/Badge";

// Patient-facing labels for what is, underneath, still a Token — see the
// "Appointment model" design note: there is no separate Appointment
// entity, only a friendlier presentation of Token.status for the patient
// audience. Staff-facing UI keeps TokenStatusBadge's raw enum labels
// (queue-operational, e.g. "CHECKED IN") unchanged — this is additive,
// colocated here rather than folded into StatusBadge.tsx.
export const APPOINTMENT_STATUS_LABEL: Record<TokenStatus, string> = {
  BOOKED: "Confirmed",
  CHECKED_IN: "Checked in — waiting",
  IN_CONSULT: "In consultation",
  COMPLETED: "Completed",
  NO_SHOW: "Missed",
  CANCELLED: "Cancelled",
};

export const APPOINTMENT_STATUS_VARIANT: Record<TokenStatus, BadgeVariant> = {
  BOOKED: "neutral",
  CHECKED_IN: "info",
  IN_CONSULT: "warning",
  COMPLETED: "success",
  NO_SHOW: "danger",
  CANCELLED: "neutral",
};

const UPCOMING_STATUSES: readonly TokenStatus[] = ["BOOKED", "CHECKED_IN", "IN_CONSULT"];

export function isUpcomingAppointmentStatus(status: TokenStatus): boolean {
  return UPCOMING_STATUSES.includes(status);
}

// Label for the link from an appointment to its ticket page (/t/[publicId]),
// which doubles as both the confirmation screen (BOOKED) and the live
// queue view (CHECKED_IN/IN_CONSULT) — see the "Appointment model" design
// note on why this is one page, not two.
export function appointmentCtaLabel(status: TokenStatus): string {
  if (status === "BOOKED") return "View confirmation";
  if (status === "CHECKED_IN" || status === "IN_CONSULT") return "View live queue";
  return "View details";
}
