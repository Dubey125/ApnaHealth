import { before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { BASE_URL, getPage, prisma, requireServer } from "./helpers";

// The webhook endpoint, against the running app.
//
// This is the only route that changes commercial state without a session,
// so the case that matters is the one where an attacker POSTs to it
// directly. The unit tests prove the signature function; these prove the
// route actually calls it before doing anything.

const configured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim());

before(async () => {
  await requireServer();
});

async function post(body: string, signature?: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-razorpay-signature": signature } : {}),
    },
    body,
  });
}

test("an unsigned request never changes anything", async () => {
  // The forged request. Whatever the endpoint does with it, a clinic must
  // not end up marked as paid.
  const before = await prisma.subscription.findMany({ select: { id: true, status: true } });

  const body = JSON.stringify({
    event: "subscription.charged",
    payload: { subscription: { entity: { id: "sub_forged", notes: { clinicId: before[0]?.id ?? "any" } } } },
  });
  const response = await post(body);

  // 401 when Razorpay is configured; 200-with-ignored when it is not,
  // because there is no secret to verify against and nothing is done
  // either way. Both are safe; being marked paid is not.
  assert.ok([200, 401].includes(response.status), `unexpected status ${response.status}`);

  const after = await prisma.subscription.findMany({ select: { id: true, status: true } });
  assert.deepEqual(after, before, "an unsigned webhook must not change any subscription");
});

test("a wrongly signed request never changes anything", async () => {
  const before = await prisma.subscription.findMany({ select: { id: true, status: true } });
  const body = JSON.stringify({ event: "subscription.charged" });
  const forged = createHmac("sha256", "not-the-real-secret").update(body).digest("hex");

  const response = await post(body, forged);
  assert.ok([200, 401].includes(response.status));

  const after = await prisma.subscription.findMany({ select: { id: true, status: true } });
  assert.deepEqual(after, before, "a forged signature must not change any subscription");
});

test("the endpoint rejects a forged signature with 401 when configured", { skip: !configured }, async () => {
  const body = JSON.stringify({ event: "subscription.charged" });
  const forged = createHmac("sha256", "not-the-real-secret").update(body).digest("hex");
  const response = await post(body, forged);
  assert.equal(response.status, 401);
});

test("the endpoint never leaks whether a secret is configured in its error body", async () => {
  const response = await post(JSON.stringify({ event: "subscription.charged" }), "deadbeef");
  const text = await response.text();
  for (const term of ["secret", "key_id", "razorpay_", "hmac"]) {
    assert.ok(!text.toLowerCase().includes(term), `response leaked "${term}"`);
  }
});

test("the webhook route is not crawlable", async () => {
  const robots = await getPage("/robots.txt");
  assert.ok(robots.body.includes("Disallow: /api/"), "/api/ must stay out of the index");
});

test("the public legal pages exist and are reachable", async () => {
  // Razorpay's merchant terms require a published, reachable refund
  // policy. A 404 here is a compliance problem, not just a broken link.
  for (const path of ["/terms", "/refunds"]) {
    const page = await getPage(path);
    assert.equal(page.status, 200, `${path} should be reachable`);
  }
});

test("the refund policy states both when we refund and when we do not", async () => {
  const page = await getPage("/refunds");
  assert.match(page.body, /When we do not refund/i, "the policy must be upfront about refusals");
  assert.match(page.body, /When we will refund/i, "and about what it does cover");
  assert.match(page.body, /statutory rights/i, "and must not claim to override consumer law");
});

/**
 * Visible text, with React's comment markers removed.
 *
 * React splits interpolated values with <!-- --> markers, so "including
 * {TRIAL_DAYS} days free" renders as "including <!-- -->7<!-- --> days
 * free" and a naive substring match fails on text that is actually
 * correct. Stripping them is what a reader sees.
 */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

test("the price and trial length shown to a clinic match what is configured", async () => {
  // The number a clinic reads and the number Razorpay takes come from one
  // constant. A drift between them is a dispute waiting to happen.
  const text = visibleText((await getPage("/terms")).body);
  assert.match(text, /499/, "the terms should state the real price");
  assert.match(text, /7 days free/i, "and the real trial length");
});

test("the refund policy leads with the free trial rather than burying it", async () => {
  const text = visibleText((await getPage("/refunds")).body);
  assert.match(text, /7 days free/i);
  assert.match(text, /not refundable|do not refund/i, "the refusal must be stated plainly, not implied");
});
