import { prisma } from "@/lib/db";
import type { Subscription } from "@/generated/prisma/client";
import { UNBILLED_ENTITLEMENTS, entitlementsFor, type Entitlements } from "./entitlements";
import { daysRemaining, dueStatusChange, fieldsForTransition } from "./subscription";

export interface ClinicBilling {
  subscription: Subscription | null;
  entitlements: Entitlements;
  /** Days left on a trial or grace period, whichever applies. Null if neither. */
  daysLeft: number | null;
}

/**
 * The clinic's current commercial state, with time already applied.
 *
 * A trial that ran out overnight and a grace period that expired on a
 * Sunday both have to take effect without anyone doing anything. There is
 * no scheduler in this stack (`CLAUDE.md`'s locked stack has no cron, and
 * a silently failing job would leave clinics entitled or suspended by
 * accident), so the clock is evaluated on read and the row is corrected
 * when it has fallen behind.
 *
 * The write is fire-and-forget relative to the caller's answer: the
 * entitlements returned already reflect the new status, so a failed write
 * delays the record, never the decision.
 */
export async function loadClinicBilling(clinicId: string, now: Date = new Date()): Promise<ClinicBilling> {
  const subscription = await prisma.subscription.findUnique({ where: { clinicId } });

  // No row: fails open. See UNBILLED_ENTITLEMENTS — a missing row is our
  // data gap, not the clinic's non-payment.
  if (!subscription) {
    return { subscription: null, entitlements: UNBILLED_ENTITLEMENTS, daysLeft: null };
  }

  const due = dueStatusChange(subscription, now);
  if (!due) {
    return {
      subscription,
      entitlements: entitlementsFor(subscription.status),
      daysLeft: daysRemaining(subscription.trialEndsAt ?? subscription.gracePeriodEndsAt, now),
    };
  }

  const fields = fieldsForTransition(due, subscription.plan, now);
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.subscription.update({ where: { id: subscription.id }, data: fields });
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        fromStatus: subscription.status,
        toStatus: due,
        // No actor: this was the clock, not a person. The audit trail must
        // be able to say so rather than attributing it to whoever
        // happened to load the page.
        reason: subscription.status === "TRIALING" ? "Trial period ended" : "Grace period expired",
        occurredAt: now,
      },
    });
    return next;
  });

  return { subscription: updated, entitlements: entitlementsFor(updated.status), daysLeft: null };
}

/**
 * Entitlements only, for the many callers that need a yes/no and not the
 * whole commercial picture.
 */
export async function loadEntitlements(clinicId: string, now: Date = new Date()): Promise<Entitlements> {
  return (await loadClinicBilling(clinicId, now)).entitlements;
}
