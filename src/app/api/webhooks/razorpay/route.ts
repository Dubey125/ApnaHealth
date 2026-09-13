import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/monitoring";
import { razorpayConfig, statusForWebhookEvent, verifyWebhookSignature } from "@/lib/billing/razorpay";
import { canTransition, fieldsForTransition } from "@/lib/billing/subscription";

// Razorpay's webhook.
//
// This is the only endpoint in the product that can change a clinic's
// commercial state without anyone signing in, which makes it the one that
// has to be most careful. Four rules:
//
//   verify first     the HMAC signature IS the authentication. Nothing is
//                    read out of the body, and no work is done, until it
//                    checks out against the raw bytes.
//   be idempotent    Razorpay retries until it gets a 2xx and may redeliver
//                    after success. A repeated `charged` must not extend a
//                    period twice.
//   fail closed      an unknown event, an unmatched clinic or an illegal
//                    transition is acknowledged and ignored, never guessed
//                    at. Guessing wrong either strands a paying customer or
//                    gives the product away.
//   2xx on purpose   a 500 makes Razorpay retry forever. Anything we have
//                    genuinely handled — including "understood, ignoring" —
//                    returns 200, and only a signature failure is a 4xx.

export const runtime = "nodejs";
// Never cached, never statically analysed: this must run per request.
export const dynamic = "force-dynamic";

interface WebhookPayload {
  event?: string;
  payload?: {
    subscription?: { entity?: { id?: string; notes?: Record<string, string>; current_end?: number } };
  };
}

/** Prisma's code for a unique-constraint violation. */
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

export async function POST(request: Request): Promise<NextResponse> {
  const config = razorpayConfig();
  if (!config) {
    // Razorpay is not configured. Not an error — development, CI and the
    // manual-payment pilot all run this way.
    return NextResponse.json({ ignored: "razorpay not configured" }, { status: 200 });
  }

  // The RAW body. Parsing to JSON and re-stringifying would change
  // whitespace and key order, and the signature would never match again.
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
    // 401, and nothing else: no detail about what was wrong, because the
    // only caller who cares is someone trying to forge one.
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  const event = payload.event;
  // Razorpay's own delivery id. Falls back to a signature-derived key so
  // idempotency still holds if the header is ever absent.
  const eventId = request.headers.get("x-razorpay-event-id") ?? `sig:${signature}`;
  if (!event) return NextResponse.json({ ignored: "no event" }, { status: 200 });

  try {
    const target = statusForWebhookEvent(event);
    if (!target) return NextResponse.json({ ignored: event }, { status: 200 });

    const entity = payload.payload?.subscription?.entity;
    // Our own clinicId, put into `notes` when the subscription was created.
    // Preferred over anything the customer could have typed. Falling back
    // to the provider subscription id keeps events matchable if notes are
    // ever missing.
    const clinicId = entity?.notes?.clinicId;
    const providerSubscriptionId = entity?.id;

    const subscription = clinicId
      ? await prisma.subscription.findUnique({ where: { clinicId } })
      : providerSubscriptionId
        ? await prisma.subscription.findFirst({ where: { providerSubscriptionId } })
        : null;

    if (!subscription) {
      // Acknowledged, not retried: a webhook for a clinic we cannot match
      // will never match on a retry either.
      return NextResponse.json({ ignored: "no matching subscription" }, { status: 200 });
    }

    if (subscription.status === target) {
      return NextResponse.json({ ignored: "already in that state" }, { status: 200 });
    }
    if (!canTransition(subscription.status, target)) {
      // The state machine says this is impossible — for instance a
      // `charged` arriving for a subscription the owner just cancelled.
      // Recorded and ignored rather than forced.
      return NextResponse.json({ ignored: `illegal transition ${subscription.status} -> ${target}` }, { status: 200 });
    }

    const now = new Date();
    const fields = fieldsForTransition(target, subscription.plan, now);

    // The idempotency claim goes in the SAME transaction as the work.
    //
    // Claiming first and then working would be worse than not claiming at
    // all: a transient database failure would leave the event marked
    // processed but never applied, and every retry would be rejected as a
    // duplicate — silently losing a payment. Inside the transaction, a
    // failure rolls the claim back too, so a retry genuinely re-processes.
    //
    // The unique constraint still does the concurrency work: two
    // simultaneous deliveries race to insert and exactly one commits.
    await prisma.$transaction([
      prisma.processedWebhookEvent.create({
        data: { provider: "razorpay", eventId, eventType: event, processedAt: now },
      }),
      prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          ...fields,
          providerSubscriptionId: providerSubscriptionId ?? subscription.providerSubscriptionId,
          // Razorpay's own period end is more authoritative than our
          // 30-day estimate, when it sends one.
          ...(entity?.current_end ? { currentPeriodEndAt: new Date(entity.current_end * 1000) } : {}),
        },
      }),
      prisma.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: target,
          reason: `Razorpay: ${event}`,
          // No actorAdminId: a payment provider is not a person, and the
          // audit trail must not imply one made this decision.
          occurredAt: now,
          metadata: { event, providerSubscriptionId: providerSubscriptionId ?? null },
        },
      }),
    ]);

    return NextResponse.json({ ok: true, status: target }, { status: 200 });
  } catch (error) {
    // A duplicate delivery loses the race on the unique constraint. That
    // is success, not failure: the event has already been applied, so
    // acknowledge it and stop Razorpay retrying.
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ ignored: "already processed" }, { status: 200 });
    }

    // Anything else is a genuine failure on our side. 500 so Razorpay
    // retries — and because the claim was inside the transaction, it
    // rolled back with everything else and the retry will re-process.
    reportError(error, { path: "/api/webhooks/razorpay", method: "POST" });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
