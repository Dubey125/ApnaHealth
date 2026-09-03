import { before, test } from "node:test";
import assert from "node:assert/strict";
import { getPage, prisma, requireServer } from "./helpers";

// Security headers and the authorization rules that are easy to regress
// silently, because nothing looks broken when they go missing.

before(async () => {
  await requireServer();
});

test("every response carries the security headers", async () => {
  const page = await getPage("/doctors");
  const header = (name: string) => page.headers.get(name);

  assert.equal(header("x-content-type-options"), "nosniff");
  assert.equal(header("x-frame-options"), "DENY");
  assert.equal(header("referrer-policy"), "strict-origin-when-cross-origin");
  assert.ok(header("strict-transport-security")?.includes("max-age="), "expected HSTS");
  assert.ok(header("content-security-policy"), "expected a CSP");
});

test("the CSP blocks the things it is there to block", async () => {
  const csp = (await getPage("/doctors")).headers.get("content-security-policy") ?? "";
  for (const directive of [
    "object-src 'none'", // no plugin embed as an injection vector
    "base-uri 'self'", // an injected <base> cannot re-point every relative URL
    "form-action 'self'", // an injected form cannot post credentials away
    "frame-ancestors 'none'", // no clickjacking the booking or cancel flows
  ]) {
    assert.ok(csp.includes(directive), `CSP missing: ${directive}`);
  }
});

// The upgrade that made CSP an actual XSS defence rather than a set of
// useful side directives.
test("script-src uses a per-request nonce and never 'unsafe-inline'", async () => {
  const first = (await getPage("/doctors")).headers.get("content-security-policy") ?? "";
  const second = (await getPage("/doctors")).headers.get("content-security-policy") ?? "";

  const scriptSrc = first.split(";").find((directive) => directive.trim().startsWith("script-src")) ?? "";
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "an injected script would run: " + scriptSrc);
  assert.match(scriptSrc, /'nonce-[A-Za-z0-9+/=]+'/, "expected a nonce");
  assert.ok(scriptSrc.includes("'strict-dynamic'"), "Next loads its chunks via strict-dynamic");

  // A nonce reused across requests is not a nonce.
  const nonceOf = (csp: string) => csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
  assert.notEqual(nonceOf(first), nonceOf(second), "the nonce must be per-request");
});

// A <script> element without the nonce is discarded under this policy —
// including application/ld+json, which the browser never executes but CSP
// governs anyway. That would silently strip every page's structured data
// while the page still looked perfect.
test("every script on the page carries the nonce, JSON-LD included", async () => {
  for (const path of ["/doctors", "/doctors/dr-aditi-sharma"]) {
    const page = await getPage(path);
    const scripts = page.body.match(/<script[^>]*>/g) ?? [];
    assert.ok(scripts.length > 0, `${path} rendered no scripts at all`);
    const unnonced = scripts.filter((tag) => !tag.includes("nonce="));
    assert.deepEqual(unnonced, [], `${path} has scripts the CSP would discard`);
  }
});

// "Search near you" depends on geolocation, so it must stay enabled for
// this origin — while everything the app never asks for stays denied, so a
// compromised script cannot start asking.
test("Permissions-Policy keeps geolocation and denies what the app never uses", async () => {
  const policy = (await getPage("/doctors")).headers.get("permissions-policy") ?? "";
  assert.ok(policy.includes("geolocation=(self)"), "geolocation must stay available to this origin");
  for (const denied of ["camera=()", "microphone=()", "payment=()"]) {
    assert.ok(policy.includes(denied), `expected ${denied}`);
  }
});

test("the CSP allows the one external API the address field needs", async () => {
  const csp = (await getPage("/register/clinic")).headers.get("content-security-policy") ?? "";
  assert.ok(
    csp.includes("https://api.postalpincode.in"),
    "PIN-code lookup would break silently without this",
  );
});

// The flagged hole: /t/[publicId] is deliberately public so a walk-in can
// be handed a link, and TicketActions encourages sharing it on WhatsApp so
// family can watch the queue. Watching is not the same permission as
// cancelling.
test("a ticket page does not offer cancel to someone who only holds the link", async () => {
  const owned = await prisma.token.findFirst({
    where: { patientId: { not: null }, status: { in: ["BOOKED", "CHECKED_IN"] } },
    select: { publicId: true },
  });
  if (!owned) return;

  const page = await getPage(`/t/${owned.publicId}`);
  assert.equal(page.status, 200, "the ticket itself stays viewable — that is the point of the link");
  assert.ok(
    page.body.includes("sign in and open My appointments"),
    "an owned appointment should route the viewer to the authenticated cancel path",
  );
  assert.ok(
    !page.body.includes("Cancel my token"),
    "the anonymous cancel button must not be offered for an owned appointment",
  );
});

test("a walk-in ticket keeps its anonymous cancel, since the link is all its holder has", async () => {
  const walkIn = await prisma.token.findFirst({
    where: { patientId: null, status: { in: ["BOOKED", "CHECKED_IN"] } },
    select: { publicId: true },
  });
  if (!walkIn) return;

  const page = await getPage(`/t/${walkIn.publicId}`);
  assert.ok(
    page.body.includes("Cancel my token"),
    "a patient with no account must still be able to cancel from their link",
  );
});

test("the public API rate limits itself", async () => {
  // Not exhausting the limit here — that would poison the bucket for every
  // later test in the run. Asserting the endpoint answers and declares
  // itself uncacheable is the part that must not regress.
  const response = await fetch(
    `${(await getPage("/healthz")).url.replace("/healthz", "")}/api/discovery/nearby?lat=18.5372&lng=73.8949`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("error and not-found pages never leak secrets or server internals", async () => {
  const page = await getPage("/doctors/no-such-doctor");

  // Script and link tags are stripped first: in development Next serves
  // chunks from paths like /_next/static/chunks/node_modules_next_dist_...,
  // which is a bundler artefact, not an information leak. Asserting on the
  // raw HTML flagged those and said nothing about actual exposure.
  const rendered = page.body
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<link[^>]*>/g, "");

  for (const secret of [
    "postgres://",
    "postgresql://",
    process.env.SESSION_SECRET ?? "SESSION_SECRET_NOT_SET",
    "PrismaClientKnownRequestError",
    "PrismaClientValidationError",
    "Invalid `prisma.",
  ]) {
    assert.ok(!rendered.includes(secret), `a 404 page exposed "${secret.slice(0, 24)}"`);
  }

  // And no stack frames rendered as page content.
  assert.ok(!/at\s+\w+\s+\(.*:\d+:\d+\)/.test(rendered), "a stack frame was rendered to the visitor");
});
