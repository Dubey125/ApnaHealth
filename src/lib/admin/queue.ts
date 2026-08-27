import type { ApprovalStatus, VerificationStatus } from "@/generated/prisma/enums";

// How long a submission has been sitting in the review queue, in whole
// days. Pure so the "waiting N days" copy is testable and so the page does
// not do date arithmetic inline.
export function daysWaiting(since: Date, now: Date = new Date()): number {
  const ms = now.getTime() - since.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

// Anything older than this is called out in the queue. Not an SLA promise
// to facilities — nothing in the product tells them a number — just the
// point at which a reviewer should see that something is being neglected.
export const REVIEW_ATTENTION_DAYS = 3;

export function needsAttention(since: Date, now: Date = new Date()): boolean {
  return daysWaiting(since, now) >= REVIEW_ATTENTION_DAYS;
}

export function waitingLabel(since: Date, now: Date = new Date()): string {
  const days = daysWaiting(since, now);
  if (days === 0) return "Submitted today";
  if (days === 1) return "Waiting 1 day";
  return `Waiting ${days} days`;
}

export const APPROVAL_FILTERS: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED"];
export const VERIFICATION_FILTERS: VerificationStatus[] = ["PENDING", "VERIFIED", "REJECTED"];
