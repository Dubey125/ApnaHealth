import type { SubscriptionStatus } from "@/generated/prisma/enums";

// What a clinic can still do when it has not paid.
//
// This file exists because the obvious implementation of billing
// enforcement is dangerous. "Subscription lapsed, block the app" is one
// line of code and it would mean a waiting room full of people who each
// hold a token, a doctor mid-consultation, and a receptionist who cannot
// call the next patient — because a card expired.
//
// A clinic's patients are not party to the commercial relationship and
// must never be the leverage. So degradation is deliberately partial and
// always in one direction: **stop new commitments, never abandon existing
// ones.**
//
// The rule, stated once:
//
//   Work already promised to a patient is ALWAYS completable.
//   Work not yet promised can be withheld.
//
// A token that exists is a promise. Everything downstream of it — check
// in, call next, complete the consult, write the record, close the
// session — must keep working in every state, including a fully suspended
// one. What stops is issuing NEW tokens and scheduling NEW sessions.

export interface Entitlements {
  /** Create sessions, add doctors, invite staff — commitments not yet made. */
  canScheduleNewWork: boolean;
  /** Issue a token, walk-in or self-booked: a new promise to a patient. */
  canIssueTokens: boolean;
  /**
   * Run the queue for tokens that already exist: check in, call next,
   * complete, record, close.
   *
   * True in EVERY state. There is no subscription status in which a
   * patient already holding a token can be abandoned, and no future
   * status should change that without a deliberate decision by a person
   * who has read this comment.
   */
  canOperateExistingQueue: true;
  /** Read analytics and export. Withheld on suspension; never destroyed. */
  canViewAnalytics: boolean;
  /** Whether the owner should be shown a banner, and how urgent. */
  notice: "none" | "trial" | "payment_failed" | "suspended" | "cancelled";
}

export function entitlementsFor(status: SubscriptionStatus): Entitlements {
  const base = { canOperateExistingQueue: true } as const;

  switch (status) {
    case "TRIALING":
      return { ...base, canScheduleNewWork: true, canIssueTokens: true, canViewAnalytics: true, notice: "trial" };

    case "ACTIVE":
      return { ...base, canScheduleNewWork: true, canIssueTokens: true, canViewAnalytics: true, notice: "none" };

    // A failed payment changes nothing operationally. Most are an expired
    // card, and the clinic finds out from the banner — not from a queue
    // that stopped working during morning OPD.
    case "PAST_DUE":
      return {
        ...base,
        canScheduleNewWork: true,
        canIssueTokens: true,
        canViewAnalytics: true,
        notice: "payment_failed",
      };

    // Grace expired. New commitments stop; everything already promised
    // still completes. A clinic in this state can finish today's list.
    case "SUSPENDED":
      return {
        ...base,
        canScheduleNewWork: false,
        canIssueTokens: false,
        canViewAnalytics: false,
        notice: "suspended",
      };

    // The customer's own decision. Same operational floor: whoever is
    // already in the queue is still seen.
    case "CANCELLED":
      return {
        ...base,
        canScheduleNewWork: false,
        canIssueTokens: false,
        canViewAnalytics: false,
        notice: "cancelled",
      };
  }
}

/**
 * A clinic with no Subscription row at all.
 *
 * Fails OPEN, on purpose. Every clinic that existed before billing was
 * introduced has no row, and a missing row is our data gap, not their
 * non-payment — treating absence as "unpaid" would suspend every existing
 * customer the moment this deployed. The backfill migration creates rows;
 * this is the safety net if one is ever missed.
 */
export const UNBILLED_ENTITLEMENTS: Entitlements = {
  canScheduleNewWork: true,
  canIssueTokens: true,
  canOperateExistingQueue: true,
  canViewAnalytics: true,
  notice: "none",
};

/** Whether adding one more doctor would exceed the seat allowance. */
export function hasSeatAvailable(currentDoctorCount: number, doctorSeats: number): boolean {
  return currentDoctorCount < doctorSeats;
}

/**
 * A clinic already over its seat count is never stripped of doctors.
 *
 * Seats are enforced when adding, not retroactively: a plan downgrade
 * must not silently delist doctors a clinic's patients are booked with.
 * The owner is shown the overage and asked to resolve it.
 */
export function seatOverage(currentDoctorCount: number, doctorSeats: number): number {
  return Math.max(0, currentDoctorCount - doctorSeats);
}
