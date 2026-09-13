import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSessionSecret, validateDatabaseUrl,
  productionConfigWarnings,
} from "./env";

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

test("productionConfigWarnings stays quiet outside production", () => {
  assert.deepEqual(productionConfigWarnings({ NODE_ENV: "development" } as NodeJS.ProcessEnv), []);
});

test("productionConfigWarnings flags a missing or localhost SITE_URL", () => {
  const missing = productionConfigWarnings({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  assert.ok(missing.some((w) => w.includes("SITE_URL is not set")));

  const localhost = productionConfigWarnings({
    NODE_ENV: "production",
    SITE_URL: "http://localhost:3000",
  } as NodeJS.ProcessEnv);
  assert.ok(localhost.some((w) => w.includes("should be an https origin")));
});

test("a correctly configured production environment produces no warnings", () => {
  const warnings = productionConfigWarnings({
    NODE_ENV: "production",
    SITE_URL: "https://apnahealth.in",
    RESEND_API_KEY: "re_live_key",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(warnings, []);
});
