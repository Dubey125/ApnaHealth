import { z } from "zod";

const sessionSecretSchema = z
  .string()
  .min(32, "SESSION_SECRET must be at least 32 characters (openssl rand -base64 32)");
const databaseUrlSchema = z.string().min(1, "DATABASE_URL is required");

// Pure validators, independently testable — kept separate from the
// process.env-reading, memoizing getters below so tests can exercise the
// validation logic with synthetic input instead of mutating process.env.
export function validateSessionSecret(value: string | undefined): string {
  const parsed = sessionSecretSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration — SESSION_SECRET: ${parsed.error.issues[0].message}`);
  }
  return parsed.data;
}

export function validateDatabaseUrl(value: string | undefined): string {
  const parsed = databaseUrlSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration — DATABASE_URL: ${parsed.error.issues[0].message}`);
  }
  return parsed.data;
}

// The public origin this deployment is served from, used for canonical
// URLs, the sitemap, Open Graph URLs and JSON-LD @id values — every one of
// which has to be absolute and has to agree with every other.
//
// NOT fail-closed, unlike the two above. A missing SITE_URL is an SEO
// problem, not a security or correctness one, and refusing to boot over it
// would take a working clinic offline to fix a canonical tag. It falls back
// to localhost, which is right in development and visibly wrong in
// production — see .env.example.
const DEFAULT_SITE_URL = "http://localhost:3000";

export function validateSiteUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_SITE_URL;
  try {
    // Normalised through URL so a trailing slash or a stray path can never
    // produce "https://site.in//doctors" in a canonical tag.
    return new URL(trimmed).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

let cachedSiteUrl: string | null = null;
let cachedSessionSecret: string | null = null;
let cachedDatabaseUrl: string | null = null;

// Lazy and memoized, not validated at module-import time: importing this
// file (directly or via db.ts/session.ts) must never throw just because a
// unit test hasn't set its env vars yet — those are set just before the
// code path that needs them runs (see session.test.ts). instrumentation
// .ts's register() calls validateEnv() once at real server boot instead,
// for a true fail-fast check that never touches the test suite.
export function getSessionSecret(): string {
  return (cachedSessionSecret ??= validateSessionSecret(process.env.SESSION_SECRET));
}

export function getDatabaseUrl(): string {
  return (cachedDatabaseUrl ??= validateDatabaseUrl(process.env.DATABASE_URL));
}

export function getSiteUrl(): string {
  return (cachedSiteUrl ??= validateSiteUrl(process.env.SITE_URL));
}

/** Absolute URL for a site-relative path, e.g. "/doctors/dr-x". */
export function absoluteUrl(path: string): string {
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Configuration that is wrong rather than missing.
 *
 * These do not stop the server — an unset SITE_URL is an SEO problem, not a
 * reason to take a clinic offline mid-session — but they are silent
 * failures, which is worse than loud ones. Every canonical link, sitemap
 * entry, JSON-LD @id and Open Graph URL is built from SITE_URL: if it still
 * says localhost in production, search engines are told that is where every
 * page lives, and nothing anywhere reports it.
 *
 * Returns the warnings rather than logging them, so this is testable.
 */
export function productionConfigWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const warnings: string[] = [];

  const siteUrl = env.SITE_URL?.trim();
  if (!siteUrl) {
    warnings.push(
      "SITE_URL is not set. Canonical URLs, the sitemap and social cards will all claim this site is at http://localhost:3000.",
    );
  } else if (/^http:\/\//i.test(siteUrl) || /localhost|127\.0\.0\.1/i.test(siteUrl)) {
    warnings.push(`SITE_URL is "${siteUrl}" — production should be an https origin on the real domain.`);
  }

  if (!env.RESEND_API_KEY?.trim()) {
    warnings.push(
      "RESEND_API_KEY is not set, so /forgot-password will refuse every request and nobody can recover an account.",
    );
  }

  // Documented in docs/product/MAP_TILES.md: OpenStreetMap's tile usage
  // policy forbids heavy application use, so the default is a pilot-only
  // setting.
  const tiles = env.MAP_TILE_URL?.trim();
  if (!tiles) {
    warnings.push(
      "MAP_TILE_URL is not set, so maps use tile.openstreetmap.org — whose usage policy forbids production application use. Set your own tile source, or MAP_TILE_URL=off.",
    );
  }

  return warnings;
}

export function validateEnv(): void {
  getSessionSecret();
  getDatabaseUrl();
}
