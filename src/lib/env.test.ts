import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSessionSecret, validateDatabaseUrl } from "./env";

test("validateSessionSecret accepts a 32+ character secret", () => {
  const secret = "a".repeat(32);
  assert.equal(validateSessionSecret(secret), secret);
});

test("validateSessionSecret rejects a secret shorter than 32 characters", () => {
  assert.throws(() => validateSessionSecret("too-short"), /SESSION_SECRET/);
});

test("validateSessionSecret rejects undefined", () => {
  assert.throws(() => validateSessionSecret(undefined), /SESSION_SECRET/);
});

test("validateDatabaseUrl accepts a non-empty string", () => {
  const url = "postgresql://user:pass@localhost:5432/db";
  assert.equal(validateDatabaseUrl(url), url);
});

test("validateDatabaseUrl rejects an empty string", () => {
  assert.throws(() => validateDatabaseUrl(""), /DATABASE_URL/);
});

test("validateDatabaseUrl rejects undefined", () => {
  assert.throws(() => validateDatabaseUrl(undefined), /DATABASE_URL/);
});
