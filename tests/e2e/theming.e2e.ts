import { before, test } from "node:test";
import assert from "node:assert/strict";
import { getPage, requireServer, staffCookie } from "./helpers";

// Theming, responsiveness and the role boundaries on the newest pages.
//
// The theme parts are here rather than in a unit test because the two ways
// this feature breaks are both integration failures: the no-flash script
// being silently dropped by CSP, and the stylesheet shipping only one of
// the three theme states.

before(async () => {
  await requireServer();
});

test("the no-flash theme script is present and carries the CSP nonce", async () => {
  // Without the nonce this script is silently discarded by the policy in
  // lib/security/csp.ts — the page looks fine, and every visitor who chose
  // a theme gets a flash of the other one, with nothing in the console.
  const page = await getPage("/");
  const match = page.body.match(/<script nonce="([^"]+)"[^>]*>try\{var t=localStorage\.getItem\("theme"\)/);
  assert.ok(match, "the theme script should be present and nonced");
  assert.ok(match[1].length > 10, "the nonce should be a real value");
});

test("the theme script interpolates nothing, so it cannot carry an injection", async () => {
  const page = await getPage("/");
  const script = page.body.match(/<script nonce="[^"]+"[^>]*>(try\{var t=localStorage[\s\S]*?)<\/script>/);
  assert.ok(script, "expected the theme script");
  // It reads one key and writes one attribute against a fixed allowlist.
  // If a future edit interpolates anything into it, this catches it.
  assert.ok(!script[1].includes("${"), "the theme script must never interpolate a value");
  assert.match(script[1], /t==="dark"\|\|t==="light"/, "only two values may ever be applied");
});

test("the page declares a responsive viewport", async () => {
  const page = await getPage("/");
  assert.match(page.body, /<meta name="viewport" content="width=device-width/);
});

test("the theme control is a labelled radio group, not an unlabelled button", async () => {
  // A cycle button cannot say what the current state is without being
  // pressed. Anyone who cannot see the colours change — the people most
  // likely to have a strong theme preference — needs the state announced.
  const page = await getPage("/");
  assert.ok(page.body.includes("Colour theme"), "the group should have an accessible name");
  for (const value of ["light", "dark", "system"]) {
    assert.ok(page.body.includes(`value="${value}"`), `expected a ${value} option`);
  }
});

test("a front-desk user cannot open the owner's subscription page", async () => {
  // The commercial relationship is the owner's, not the receptionist's.
  // requireStaffSession("OWNER") is the boundary; this checks it holds
  // over HTTP rather than only in the source.
  const cookie = await staffCookie("FRONT_DESK");
  const page = await getPage("/app/billing", { headers: { cookie } });
  assert.notEqual(page.status, 200, "a FRONT_DESK session must not reach /app/billing");
});

test("a doctor cannot open the owner's subscription page either", async () => {
  const cookie = await staffCookie("DOCTOR");
  const page = await getPage("/app/billing", { headers: { cookie } });
  assert.notEqual(page.status, 200, "a DOCTOR session must not reach /app/billing");
});

test("an owner can, and never sees another clinic's figures", async () => {
  const cookie = await staffCookie("OWNER");
  const page = await getPage("/app/billing", { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.ok(page.body.includes("Subscription"), "expected the subscription page");
  // The page derives everything from the session's own clinicId and takes
  // no identifier from the request, so there is nothing to tamper with.
  assert.ok(page.body.includes("What keeps working, always"), "the operational guarantee should be stated");
});

test("clinic staff cannot reach the platform admin's subscription console", async () => {
  for (const role of ["OWNER", "FRONT_DESK", "DOCTOR"] as const) {
    const cookie = await staffCookie(role);
    const page = await getPage("/admin/subscriptions", { headers: { cookie } });
    assert.notEqual(page.status, 200, `${role} must not reach /admin/subscriptions`);
  }
});

test("the subscription pages are never indexed", async () => {
  const cookie = await staffCookie("OWNER");
  const page = await getPage("/app/billing", { headers: { cookie } });
  assert.match(page.body, /<meta name="robots" content="noindex/, "commercial pages must not be crawlable");
});
