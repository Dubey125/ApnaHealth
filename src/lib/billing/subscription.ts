import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma/enums";

// The subscription state machine, kept free of Prisma and of any payment
// provider.
//
// Deliberately provider-agnostic. Nothing here knows whether money moved
// through Razorpay, Stripe, a bank transfer or an admin's judgement — a
// provider webhook will eventually be one more caller of the same
// transitions an admin already uses. That keeps the rules that matter
// (who is entitled to what, and when) testable without a network.

/**
 * Free trial length.
 *
 * Seven days, not thirty: an OPD clinic runs a full week of sessions in
 * that time, which is enough to know whether the queue works for them.
 * A longer trial mostly delays the decision rather than informing it.
 */
export const TRIAL_DAYS = 7;

/**
 * How long a failed payment is tolerated before the account degrades.
 *
 * Seven days rather than one or two, because the failure modes are
 * mundane and human: an expired card, a bank's fraud hold, an owner on
 * leave. A week is long enough that an ordinary administrative hiccup
 * never reaches a patient, and short enough to stay a real boundary.
 */
export const GRACE_DAYS = 7;

export const PLAN_SEATS: Record<SubscriptionPlan, number> = {
  TRIAL: 3,
  STARTER: 3,
  GROWTH: 10,
};

/**
 * Monthly price per plan, in paise.
 *
 * Paise because Razorpay works only in the minor unit, and because money
 * in a float is a bug waiting to happen. GROWTH is unpriced for now —
 * there is one live price (₹499) and inventing a second before anyone has
 * paid the first would be guessing.
 */
export const PLAN_PRICE_MINOR: Record<SubscriptionPlan, number | null> = {
  TRIAL: 0,
  STARTER: 49_900,
  GROWTH: null,
};

/** ₹499 — formatted for display, from the same source as the charge. */
export function formatPriceMinor(minor: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    minor / 100,
  );
}

/**
 * Which status transitions are legal.
 *
 * Written out rather than inferred, so an impossible move (a cancelled
 * subscription silently becoming active, a suspension appearing from
 * nowhere) fails in a tested pure function instead of somewhere in a
 * webhook handler at 2am. Mirrors how session transitions are handled in
 * src/lib/queue/sessionTransitions.ts.
 */
const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  // A trial either converts, lapses, or is abandoned.
  TRIALING: ["ACTIVE", "SUSPENDED", "CANCELLED"],
  // A live subscription can fail payment, or be cancelled by the customer.
  ACTIVE: ["PAST_DUE", "CANCELLED"],
  // A failed payment recovers, runs out of grace, or is cancelled.
  PAST_DUE: ["ACTIVE", "SUSPENDED", "CANCELLED"],
  // A suspended clinic can always come back by paying. That path must
  // never be closed off: a lapsed customer who wants to return is the
  // cheapest revenue there is.
  SUSPENDED: ["ACTIVE", "CANCELLED"],
  // Reactivation after cancellation is deliberate and allowed.
  CANCELLED: ["ACTIVE"],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid subscription transition: ${from} -> ${to}`);
  }
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export interface SubscriptionClock {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
}

/**
 * The status a subscription should hold right now, given the clock.
 *
 * Time is the one thing no webhook tells us about. A trial that ran out
 * overnight and a grace period that expired on Sunday both need to take
 * effect without anyone doing anything, so this is evaluated on read
 * rather than by a scheduled job — there is no cron in this stack, and a
 * job that fails silently would leave clinics entitled or suspended by
 * accident.
 *
 * Returns null when nothing should change, so callers can skip a write.
 */
export function dueStatusChange(clock: SubscriptionClock, now: Date): SubscriptionStatus | null {
  if (clock.status === "TRIALING" && clock.trialEndsAt && now >= clock.trialEndsAt) {
    return "SUSPENDED";
  }
  if (clock.status === "PAST_DUE" && clock.gracePeriodEndsAt && now >= clock.gracePeriodEndsAt) {
    return "SUSPENDED";
  }
  return null;
}

/** Whole days remaining, floored at zero. Null when no deadline applies. */
export function daysRemaining(deadline: Date | null, now: Date): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export interface StartTrialInput {
  now: Date;
}

export function trialDefaults(input: StartTrialInput) {
  return {
    plan: "TRIAL" as SubscriptionPlan,
    status: "TRIALING" as SubscriptionStatus,
    doctorSeats: PLAN_SEATS.TRIAL,
    trialEndsAt: addDays(input.now, TRIAL_DAYS),
  };
}

/**
 * The field changes that accompany a transition.
 *
 * Kept with the transition rules rather than in the action, because
 * forgetting to clear `gracePeriodEndsAt` when a payment recovers would
 * leave a stale deadline that later suspends a paying customer.
 */
export function fieldsForTransition(
  to: SubscriptionStatus,
  plan: SubscriptionPlan,
  now: Date,
): {
  status: SubscriptionStatus;
  plan?: SubscriptionPlan;
  doctorSeats?: number;
  trialEndsAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
  currentPeriodStartAt?: Date | null;
  currentPeriodEndAt?: Date | null;
} {
  switch (to) {
    case "ACTIVE":
      return {
        status: "ACTIVE",
        doctorSeats: PLAN_SEATS[plan === "TRIAL" ? "STARTER" : plan],
        plan: plan === "TRIAL" ? "STARTER" : plan,
        // A recovered payment must clear BOTH deadlines. Leaving either
        // set would re-suspend a clinic that has actually paid.
        trialEndsAt: null,
        gracePeriodEndsAt: null,
        currentPeriodStartAt: now,
        currentPeriodEndAt: addDays(now, 30),
      };

    case "PAST_DUE":
      return { status: "PAST_DUE", gracePeriodEndsAt: addDays(now, GRACE_DAYS) };

    case "SUSPENDED":
      // Deadlines have done their job; clearing them keeps the reason for
      // the current state unambiguous.
      return { status: "SUSPENDED", trialEndsAt: null, gracePeriodEndsAt: null };

    case "CANCELLED":
      return { status: "CANCELLED", trialEndsAt: null, gracePeriodEndsAt: null, currentPeriodEndAt: now };

    case "TRIALING":
      return { status: "TRIALING" };
  }
}
