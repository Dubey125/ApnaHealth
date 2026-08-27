import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSeedTarget } from "./seedGuard";

const LOCAL = "postgresql://u:p@localhost:5432/apnahealth";
const REMOTE = "postgresql://u:p@ep-example-pooler.eu-central-1.aws.neon.tech/neondb";

test("production is refused outright, with no override", () => {
  const result = checkSeedTarget({ databaseUrl: LOCAL, nodeEnv: "production", allowHost: "localhost" });
  assert.equal(result.allowed, false);
  // Even naming the host does not buy a way past NODE_ENV=production.
  const forced = checkSeedTarget({
    databaseUrl: REMOTE,
    nodeEnv: "production",
    allowHost: "ep-example-pooler.eu-central-1.aws.neon.tech",
  });
  assert.equal(forced.allowed, false);
});

test("a local database is allowed in development", () => {
  const result = checkSeedTarget({ databaseUrl: LOCAL, nodeEnv: "development", allowHost: undefined });
  assert.equal(result.allowed, true);
});

test("a local database is allowed with NODE_ENV unset (a plain shell)", () => {
  const result = checkSeedTarget({ databaseUrl: LOCAL, nodeEnv: undefined, allowHost: undefined });
  assert.equal(result.allowed, true);
});

test("every loopback spelling is treated as local", () => {
  for (const host of ["localhost", "127.0.0.1", "host.docker.internal"]) {
    const result = checkSeedTarget({
      databaseUrl: `postgresql://u:p@${host}:5432/db`,
      nodeEnv: "development",
      allowHost: undefined,
    });
    assert.equal(result.allowed, true, `${host} should be treated as local`);
  }
});

test("a remote database is refused unless its host is named", () => {
  const result = checkSeedTarget({ databaseUrl: REMOTE, nodeEnv: "development", allowHost: undefined });
  assert.equal(result.allowed, false);
  assert.match(result.allowed === false ? result.reason : "", /SEED_ALLOW_HOST=/);
});

test("a remote database is allowed when the operator names its exact host", () => {
  const result = checkSeedTarget({
    databaseUrl: REMOTE,
    nodeEnv: "development",
    allowHost: "ep-example-pooler.eu-central-1.aws.neon.tech",
  });
  assert.equal(result.allowed, true);
});

test("naming a DIFFERENT host does not unlock the current one", () => {
  const result = checkSeedTarget({
    databaseUrl: REMOTE,
    nodeEnv: "development",
    allowHost: "some-other-host.neon.tech",
  });
  assert.equal(result.allowed, false);
});

test("the allow-list matches the whole host, never a substring", () => {
  // "contains" matching is how an allowlist starts accepting
  // neon.tech.attacker.net; both directions must fail.
  const partial = checkSeedTarget({ databaseUrl: REMOTE, nodeEnv: "development", allowHost: "neon.tech" });
  assert.equal(partial.allowed, false);

  const extended = checkSeedTarget({
    databaseUrl: "postgresql://u:p@ep-example-pooler.eu-central-1.aws.neon.tech.attacker.net/db",
    nodeEnv: "development",
    allowHost: "ep-example-pooler.eu-central-1.aws.neon.tech",
  });
  assert.equal(extended.allowed, false);
});

test("a missing DATABASE_URL is refused rather than defaulting to anything", () => {
  const result = checkSeedTarget({ databaseUrl: undefined, nodeEnv: "development", allowHost: "localhost" });
  assert.equal(result.allowed, false);
});

test("an unparseable DATABASE_URL is refused", () => {
  const result = checkSeedTarget({ databaseUrl: "not-a-url", nodeEnv: "development", allowHost: undefined });
  assert.equal(result.allowed, false);
});

test("the refusal message never echoes the connection string", () => {
  const result = checkSeedTarget({ databaseUrl: REMOTE, nodeEnv: "development", allowHost: undefined });
  const reason = result.allowed === false ? result.reason : "";
  // The host is quoted so it can be copied into SEED_ALLOW_HOST; the
  // credentials in the URL must never appear.
  assert.ok(!reason.includes("u:p"));
  assert.ok(!reason.includes(REMOTE));
});
