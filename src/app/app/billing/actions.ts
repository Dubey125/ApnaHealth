"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/auth/staff";
import { reportError } from "@/lib/monitoring";
import { cancelSubscription, createSubscription, razorpayConfig } from "@/lib/billing/razorpay";

export interface BillingActionState {
  error?: string;
}

/**
 * Start paying: create a Razorpay subscription and send the owner to
 * authorise it.
 *
 * Owner-only. A subscription is the clinic's commercial relationship, and
 * a receptionist or doctor has no business committing the practice to a
 * recurring charge.
 *
 * Nothing here marks anyone as paid. The status only changes when
 * Razorpay's webhook says money actually moved — this action just creates
 * the mandate and hands over the hosted page. Trusting a redirect back
 * from a payment page is the classic way to give a product away for free.
 */
export async function startSubscription(
  _prevState: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const session = await requireStaffSession("OWNER");

  const config = razorpayConfig();
  if (!config) {
    return { error: "Online payment isn't set up yet. Contact us and we'll activate your plan." };
  }

  const [clinic, subscription] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({ where: { id: session.clinicId }, select: { name: true } }),
    prisma.subscription.findUnique({ where: { clinicId: session.clinicId } }),
  ]);

  if (subscription?.status === "ACTIVE") {
    return { error: "Your subscription is already active." };
  }

  let authorizeUrl: string;
  try {
    const created = await createSubscription(config, {
      clinicId: session.clinicId,
      clinicName: clinic.name,
      // The first charge is deferred to the end of the trial, so the
      // clinic authorises today and is not billed until the free days are
      // actually used up. Without this, "7 days free" would be untrue.
      startAt: subscription?.trialEndsAt ?? null,
    });

    // Recorded so a webhook can be matched back even if `notes` are ever
    // missing from the payload.
    await prisma.subscription.update({
      where: { clinicId: session.clinicId },
      data: { providerSubscriptionId: created.id },
    });
    authorizeUrl = created.short_url;
  } catch (error) {
    reportError(error, { path: "/app/billing", method: "POST" });
    return { error: "Couldn't start the subscription just now. Try again, or contact us." };
  }

  // Razorpay's own hosted page. Deliberately a redirect rather than an
  // embedded widget: no third-party script runs on our pages, so the
  // nonce-based CSP stays intact.
  redirect(authorizeUrl);
}

/**
 * Cancel, at the end of the paid period.
 *
 * Not immediately: the clinic paid for this month and keeps it. As
 * everywhere else in billing, patients already holding a token are
 * unaffected in any state — see lib/billing/entitlements.ts.
 */
export async function cancelOwnSubscription(
  _prevState: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const session = await requireStaffSession("OWNER");

  const subscription = await prisma.subscription.findUnique({ where: { clinicId: session.clinicId } });
  if (!subscription) return { error: "No subscription on record." };

  const config = razorpayConfig();
  if (config && subscription.providerSubscriptionId) {
    try {
      await cancelSubscription(config, subscription.providerSubscriptionId);
    } catch (error) {
      reportError(error, { path: "/app/billing", method: "POST" });
      return { error: "Couldn't cancel with the payment provider. Contact us and we'll sort it out." };
    }
    // The status change itself waits for the webhook, which is the single
    // source of truth for commercial state. Razorpay will send
    // subscription.cancelled once it has actually taken effect.
    return {};
  }

  // No provider configured: this clinic is on manual billing, so record
  // the request and let an admin action it. Never silently self-cancel a
  // state an admin set by hand.
  await prisma.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      fromStatus: subscription.status,
      toStatus: subscription.status,
      reason: "Cancellation requested by the clinic owner",
      occurredAt: new Date(),
    },
  });
  return { error: "Cancellation requested. We'll confirm by email within one working day." };
}
