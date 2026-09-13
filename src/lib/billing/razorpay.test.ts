import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PRICE_MINOR, statusForWebhookEvent, verifyWebhookSignature } from "./razorpay";

const SECRET = "whsec_test_secret_value";
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("hex");

// The webhook signature is the ONLY authentication on an endpoint that can
// mark a clinic as paid. These tests are the boundary.

test("a correctly signed body is accepted", () => {
  const body = JSON.stringify({ event: "subscription.charged" });
  assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
});

test("a body signed with the wrong secret is rejected", () => {
  const body = JSON.stringify({ event: "subscription.charged" });
  assert.equal(verifyWebhookSignature(body, sign(body, "attacker-secret"), SECRET), false);
});

test("a tampered body is rejected even with a signature that was once valid", () => {
  // The attack this prevents: replay a real webhook with the clinicId
  // swapped for someone else's, to activate a different clinic for free.
  const original = JSON.stringify({ event: "subscription.charged", notes: { clinicId: "clinic_a" } });
  const signature = sign(original);
  const tampered = JSON.stringify({ event: "subscription.charged", notes: { clinicId: "clinic_b" } });
  assert.equal(verifyWebhookSignature(tampered, signature, SECRET), false);
});

test("a missing signature header is rejected rather than treated as absent-so-fine", () => {
  const body = JSON.stringify({ event: "subscription.charged" });
  assert.equal(verifyWebhookSignature(body, null, SECRET), false);
  assert.equal(verifyWebhookSignature(body, "", SECRET), false);
});

test("a signature of the wrong length is rejected without throwing", () => {
  // timingSafeEqual throws on a length mismatch. If that were unhandled,
  // a one-character signature would crash the route instead of being
  // rejected — and a crash is a 500, which makes Razorpay retry forever.
  const body = JSON.stringify({ event: "subscription.charged" });
  assert.doesNotThrow(() => verifyWebhookSignature(body, "abc", SECRET));
  assert.equal(verifyWebhookSignature(body, "abc", SECRET), false);
  assert.equal(verifyWebhookSignature(body, sign(body) + "00", SECRET), false);
});

test("whitespace differences in the body invalidate the signature", () => {
  // Why the route must hash the RAW bytes and never a re-serialised
  // object: JSON.parse followed by JSON.stringify changes spacing and key
  // order, and no signature would ever match again.
  const body = JSON.stringify({ event: "subscription.charged" });
  const reserialised = JSON.stringify(JSON.parse(body), null, 2);
  assert.notEqual(body, reserialised);
  assert.equal(verifyWebhookSignature(reserialised, sign(body), SECRET), false);
});

test("an empty body with a valid signature over it still verifies", () => {
  // Degenerate but real: Razorpay can send a body we do not understand.
  // Verification and interpretation are separate concerns.
  assert.equal(verifyWebhookSignature("", sign(""), SECRET), true);
});

// --- Event mapping ---

test("payment success maps to ACTIVE", () => {
  for (const event of ["subscription.activated", "subscription.charged", "subscription.resumed"]) {
    assert.equal(statusForWebhookEvent(event), "ACTIVE", event);
  }
});

test("collection failure maps to PAST_DUE, not straight to suspension", () => {
  // A failed charge must not cut a clinic off mid-OPD. PAST_DUE starts the
  // grace period and changes no behaviour — see entitlements.ts.
  for (const event of ["subscription.pending", "subscription.halted"]) {
    assert.equal(statusForWebhookEvent(event), "PAST_DUE", event);
  }
});

test("cancellation and completion map to CANCELLED", () => {
  for (const event of ["subscription.cancelled", "subscription.completed"]) {
    assert.equal(statusForWebhookEvent(event), "CANCELLED", event);
  }
});

test("an unrecognised event is ignored rather than guessed at", () => {
  // Razorpay emits many events. Guessing wrong on a billing event either
  // strands a paying customer or gives the product away, so anything not
  // explicitly mapped returns null and the route acknowledges it.
  for (const event of ["payment.authorized", "order.paid", "subscription.updated", "", "nonsense"]) {
    assert.equal(statusForWebhookEvent(event), null, event);
  }
});

test("the price is Rs 499 expressed in paise", () => {
  // Razorpay works only in the minor unit. A rupees-vs-paise mix-up here
  // is a factor-of-100 billing error in either direction.
  assert.equal(PRICE_MINOR, 49900);
  assert.equal(PRICE_MINOR / 100, 499);
});
