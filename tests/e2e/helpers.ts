import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { signSession } from "../../src/lib/auth/session";

// End-to-end tests, driven over HTTP against a running server.
//
// Deliberately not Playwright: CLAUDE.md forbids new dependencies without
// approval, and a browser driver is a large one (a runtime, ~300MB of
// browsers, a second test runner). Everything below runs on Node's built-in
// test runner and fetch, and still exercises the whole stack — routing,
// proxy, session verification, Prisma, rendering, HTTP status.
//
// What this CANNOT cover, and what Playwright would be for: anything
// requiring client JavaScript — the geolocation prompt, the two-step cancel
// button, the distance-from-viewer calculation, mobile nav. Those remain
// manually verified. See the note at the bottom of this file.
//
// Precondition: a dev or production server on E2E_BASE_URL (default
// http://localhost:3000) against a seeded database (`npx prisma db seed`).

/** Where the tests send requests. */
export const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * The origin the app *declares itself to be* — what it puts in canonical
 * links, sitemap entries and JSON-LD @id values.
 *
 * Deliberately separate from BASE_URL. They are usually the same, but they
 * are different questions: behind a proxy, or on a preview deployment, an
 * app is served at one address and correctly declares another. Conflating
 * them made two tests pass against the dev server on :3000 and fail against
 * a production build on :3200 — the app was right both times.
 */
export const SITE_ORIGIN = (process.env.SITE_URL ?? BASE_URL).replace(/\/$/, "");

/** The phone the seed gives its demo patient. */
export const DEMO_PATIENT_PHONE = "9000000006";

// max: 2, not the pg default of 10.
//
// These tests issue one query at a time, so a large pool buys nothing
// and costs a lot: ten connections per test file, on top of the dev
// server's twenty, is what exhausted a remote database's limit and
// produced "Can't reach database server" in a different file on every
// run — failures that read like flaky code but were the harness.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 });
// WHERE THIS SUITE IS TRUSTWORTHY
//
// CI is the authoritative run: it starts a Postgres service container on
// localhost and a production build, so every query is sub-millisecond and
// every route is already compiled.
//
// Run locally against a REMOTE database and it is not a reliable signal.
// The dev server compiles routes on first request while the suite issues
// hundreds of queries across an ocean, and individual tests intermittently
// exceed their timeout — a full run has been observed passing 89/89 twice
// and then losing one unrelated test to a 24-second response. Those
// failures are latency, not defects, and no amount of retrying would make
// them mean anything.
//
// If you want a local run you can trust, point DATABASE_URL at a local
// Postgres. Retries are deliberately NOT used here: a test that passes on
// the second attempt hides exactly the bugs this suite exists to catch.

// End-to-end tests run ONE FILE AT A TIME (--test-concurrency=1 in the
// test:e2e script).
//
// Node's test runner otherwise runs files in parallel, and each one opens
// its own PrismaClient on top of the dev server's pool. Against a local
// database that is free; against a remote one it exhausts the connection
// limit and tests fail with "Can't reach database server" — in a different
// file on every run, which reads like flakiness in the code rather than in
// the harness.
//
// Serial execution also removes a real class of false failure: these tests
// mutate shared rows (subscription status, scratch sessions), so two files
// running at once can observe each other's half-finished state.

export const prisma = new PrismaClient({ adapter });

export interface PageResponse {
  status: number;
  headers: Headers;
  body: string;
  url: string;
}

/**
 * Fetch a page without following redirects, so a test can assert on the
 * redirect itself — which is the whole point when checking an auth gate.
 */
export async function getPage(path: string, init: RequestInit = {}): Promise<PageResponse> {
  const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual", ...init });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
    url: `${BASE_URL}${path}`,
  };
}

export async function getStatus(path: string, init: RequestInit = {}): Promise<number> {
  const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual", method: "HEAD", ...init });
  // Some routes (notably metadata image routes) do not implement HEAD;
  // fall back to a GET rather than reporting a misleading 405.
  if (response.status === 405) return (await getPage(path, init)).status;
  return response.status;
}

/**
 * A signed session cookie for the seeded demo patient.
 *
 * Minted directly rather than by posting the login form: the login is a
 * Server Action, whose wire format is a Next implementation detail that a
 * test has no business depending on. This uses the app's own signSession,
 * so a broken SESSION_SECRET or a changed payload shape still fails here.
 */
export async function patientCookie(): Promise<string> {
  const patient = await prisma.patient.findUnique({ where: { phone: DEMO_PATIENT_PHONE } });
  if (!patient) {
    throw new Error(
      `No seeded patient with phone ${DEMO_PATIENT_PHONE}. Run: npx prisma db seed`,
    );
  }
  return `patient_session=${await signSession({ patientId: patient.id }, "1h")}`;
}

/**
 * A signed session cookie for a real staff user of the given role.
 *
 * Minted the same way patientCookie is, and for the same reason: the login
 * is a Server Action whose wire format a test has no business depending
 * on. Uses the app's own signSession, so a broken SESSION_SECRET or a
 * changed payload shape still fails here.
 *
 * Lets role boundaries be tested at the HTTP level — which is where they
 * actually have to hold, since a page's own requireStaffSession is the
 * boundary and proxy.ts is only defence in depth.
 */
export async function staffCookie(role: "OWNER" | "FRONT_DESK" | "DOCTOR"): Promise<string> {
  const staff = await prisma.staffUser.findFirst({
    where: { role, isActive: true },
    select: { id: true, clinicId: true, role: true, doctorId: true },
  });
  if (!staff) {
    throw new Error(`No seeded ${role} staff user. Run: npx prisma db seed`);
  }
  return `staff_session=${await signSession(
    { staffUserId: staff.id, clinicId: staff.clinicId, role: staff.role, doctorId: staff.doctorId },
    "1h",
  )}`;
}

/** How many result cards a discovery page rendered. */
export function countResultCards(html: string): number {
  return (html.match(/<h3 class="font-semibold text-foreground">/g) ?? []).length;
}

/** The doctor/facility slugs linked from a discovery page, in order. */
export function linkedSlugs(html: string, prefix: "doctors" | "facilities"): string[] {
  const pattern = new RegExp(`<h3 class="font-semibold text-foreground"><a[^>]*href="/${prefix}/([a-z0-9-]+)"`, "g");
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

/** The names rendered as result headings, in the order the page listed them. */
export function listedNames(html: string): string[] {
  const pattern = /<h3 class="font-semibold text-foreground"><a[^>]*>([^<]+)<\/a>/g;
  return [...html.matchAll(pattern)].map((match) => match[1].trim());
}

export function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    html.match(new RegExp(`<meta property="${escaped}" content="([^"]*)"`)) ??
    html.match(new RegExp(`<meta name="${escaped}" content="([^"]*)"`));
  return match ? match[1] : null;
}

export function canonicalHref(html: string): string | null {
  const match = html.match(/<link rel="canonical" href="([^"]*)"/);
  return match ? match[1] : null;
}

export function pageTitle(html: string): string | null {
  const match = html.match(/<title>([^<]*)<\/title>/);
  return match ? match[1] : null;
}

/** Every JSON-LD document embedded in a page, parsed. */
export function jsonLdDocuments(html: string): Record<string, unknown>[] {
  // `[^>]*` matters: the tag now carries a CSP nonce, and a pattern that
  // assumed a bare <script type="..."> silently found nothing rather than
  // failing loudly.
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  return blocks.flatMap((block) => {
    const parsed: unknown = JSON.parse(block[1]);
    return (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[];
  });
}

export function findJsonLd(html: string, type: string): Record<string, unknown> | undefined {
  return jsonLdDocuments(html).find((document) => document["@type"] === type);
}

/**
 * Fails loudly if the server is not running, rather than letting every test
 * fail with an opaque connection error.
 */
export async function requireServer(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/healthz`);
    if (!response.ok) throw new Error(`healthz returned ${response.status}`);
  } catch (error) {
    throw new Error(
      `No server at ${BASE_URL} (${error instanceof Error ? error.message : error}).\n` +
        `  Start one with: npm run dev\n` +
        `  Then seed it with: npx prisma db seed`,
    );
  }
}
