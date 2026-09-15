import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay, over its REST API rather than its SDK.
//
// The SDK is a thin wrapper around these same HTTP calls, and `CLAUDE.md`
// asks for a reason before every dependency. The three things it would
// give us — Basic auth, JSON, and an HMAC check — are a handful of lines
// each, and doing them here means the payment path has no third-party code
// in it and no supply-chain surface beyond what already exists.
//
// The Subscriptions API is used rather than Checkout, which matters for
// more than convenience: a subscription returns a hosted `short_url` the
// owner is redirected to, so **no Razorpay JavaScript runs on our pages**.
// That keeps the nonce-based CSP in lib/security/csp.ts intact — adding
// checkout.razorpay.com to script-src would widen the exact hole that
// policy exists to close.

const API = "https://api.razorpay.com/v1";

/** ₹499 per month, in paise. Razorpay works only in the minor unit.
 *
 * The currency itself is a property of the Razorpay plan, not of this
 * codebase — declaring it here too would be a second place for it to
 * drift from what is actually charged. */
export const PRICE_MINOR = 49_900;

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  planId: string;
}

/**
 * Configuration, or null when Razorpay is not set up.
 *
 * Null is a first-class state, not an error. Development, CI and the
 * pilot all run without payment credentials, and the subscription state
 * machine works perfectly well with an admin recording payments by hand
 * (see /admin/subscriptions). Nothing here may throw at import time or a
 * missing key would take the whole app down rather than one button.
 */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  const planId = process.env.RAZORPAY_PLAN_ID?.trim();
  if (!keyId || !keySecret || !webhookSecret || !planId) return null;
  return { keyId, keySecret, webhookSecret, planId };
}

function authHeader(config: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
}

async function call<T>(config: RazorpayConfig, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: authHeader(config), "content-type": "application/json", ...init.headers },
    // A payment API that hangs must not hold a request open indefinitely.
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    // Razorpay's message is safe to surface to an owner — it says things
    // like "plan does not exist". The key is never in it, and never
    // logged: `call` deliberately does not log the request.
    const error = body.error as { description?: string } | undefined;
    throw new Error(`Razorpay ${response.status}: ${error?.description ?? "request failed"}`);
  }
  return body as T;
}

export interface RazorpaySubscription {
  id: string;
  status: string;
  short_url: string;
  current_start: number | null;
  current_end: number | null;
}

/**
 * Create a subscription for a clinic and get the URL they authorise it at.
 *
 * `total_count` is the number of billing cycles Razorpay will attempt. 120
 * is ten years of monthly charges — effectively "until cancelled", which
 * is what a SaaS subscription means, while still being a finite mandate as
 * the API requires.
 *
 * `start_at` defers the first charge to the end of the free trial, so a
 * clinic authorises the mandate today and is not charged until the trial
 * actually expires. Without it they would be billed immediately and the
 * "7 days free" would be a lie.
 */
export async function createSubscription(
  config: RazorpayConfig,
  options: { clinicId: string; clinicName: string; startAt: Date | null },
): Promise<RazorpaySubscription> {
  const body: Record<string, unknown> = {
    plan_id: config.planId,
    total_count: 120,
    quantity: 1,
    customer_notify: 1,
    // Our own id travels with the subscription so a webhook can be matched
    // back to a clinic without trusting anything the customer typed.
    notes: { clinicId: options.clinicId, clinicName: options.clinicName },
  };
  if (options.startAt && options.startAt > new Date()) {
    body.start_at = Math.floor(options.startAt.getTime() / 1000);
  }

  return call<RazorpaySubscription>(config, "/subscriptions", { method: "POST", body: JSON.stringify(body) });
}

export async function cancelSubscription(
  config: RazorpayConfig,
  subscriptionId: string,
  atCycleEnd = true,
): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>(config, `/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    // Cancelling at the end of the paid cycle, not immediately: the clinic
    // paid for this month and should keep it.
    body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
  });
}

/**
 * Whether a webhook really came from Razorpay.
 *
 * A webhook carries no session — this signature IS the authentication, and
 * it is the only thing standing between the internet and an endpoint that
 * marks accounts paid. Three things it has to get right:
 *
 * 1. It hashes the RAW request body. Parsing to JSON and re-stringifying
 *    changes whitespace and key order, and the signature would never match
 *    again — so the caller must pass the exact bytes received.
 * 2. It compares in constant time. A byte-by-byte early return leaks how
 *    much of a guessed signature was correct, which is enough to forge one
 *    given enough attempts.
 * 3. It fails closed on any malformed input, rather than throwing.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(signature, "utf8");

  // timingSafeEqual throws on a length mismatch, which would itself be a
  // (very coarse) oracle and an unhandled exception. Checked first.
  if (expectedBytes.length !== receivedBytes.length) return false;
  return timingSafeEqual(expectedBytes, receivedBytes);
}

/**
 * Razorpay's subscription events, mapped onto our own state machine.
 *
 * Deliberately a small, explicit table. Razorpay emits a lot of events and
 * most of them are not ours to act on; anything not listed here is
 * acknowledged and ignored rather than guessed at, because guessing wrong
 * on a billing event either strands a paying customer or gives the product
 * away.
 *
 * Returning null means "understood, nothing to change".
 */
export function statusForWebhookEvent(event: string): "ACTIVE" | "PAST_DUE" | "CANCELLED" | null {
  switch (event) {
    // The mandate was authorised, or a monthly charge succeeded.
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      return "ACTIVE";

    // Razorpay could not collect. `halted` is its terminal retry state;
    // `pending` means it is still retrying. Both are PAST_DUE to us — the
    // clinic keeps working and starts its grace period.
    case "subscription.pending":
    case "subscription.halted":
      return "PAST_DUE";

    case "subscription.cancelled":
    case "subscription.completed":
      return "CANCELLED";

    default:
      return null;
  }
}
