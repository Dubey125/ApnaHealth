import type { ApprovalStatus, SessionStatus, TokenStatus, VerificationStatus } from "@/generated/prisma/enums";
import { Badge, type BadgeVariant } from "./Badge";

const TOKEN_STATUS_VARIANT: Record<TokenStatus, BadgeVariant> = {
  BOOKED: "neutral",
  CHECKED_IN: "info",
  IN_CONSULT: "warning",
  COMPLETED: "success",
  NO_SHOW: "danger",
  CANCELLED: "neutral",
};

const SESSION_STATUS_VARIANT: Record<SessionStatus, BadgeVariant> = {
  SCHEDULED: "neutral",
  OPEN: "info",
  IN_PROGRESS: "warning",
  PAUSED: "danger",
  CLOSED: "neutral",
};

const VERIFICATION_STATUS_VARIANT: Record<VerificationStatus, BadgeVariant> = {
  PENDING: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
};

function humanize(status: string): string {
  return status.replace(/_/g, " ");
}

export function TokenStatusBadge({ status }: { status: TokenStatus }) {
  return <Badge variant={TOKEN_STATUS_VARIANT[status]}>{humanize(status)}</Badge>;
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return <Badge variant={SESSION_STATUS_VARIANT[status]}>{humanize(status)}</Badge>;
}

export function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  return <Badge variant={VERIFICATION_STATUS_VARIANT[status]}>{status === "VERIFIED" ? "✓ Verified" : humanize(status)}</Badge>;
}

// Wording differs from VerificationStatusBadge on purpose: these two enums
// both read PENDING/APPROVED-ish/REJECTED, and a reviewer looking at a
// facility page that shows both must not have to work out which badge is
// about the practice and which is about a doctor's medical registration.
const APPROVAL_STATUS_VARIANT: Record<ApprovalStatus, BadgeVariant> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge variant={APPROVAL_STATUS_VARIANT[status]}>{APPROVAL_STATUS_LABEL[status]}</Badge>;
}
