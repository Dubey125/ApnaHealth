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

export function validateEnv(): void {
  getSessionSecret();
  getDatabaseUrl();
}
