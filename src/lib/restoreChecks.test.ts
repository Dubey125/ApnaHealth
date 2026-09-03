import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkApplicationInvariants,
  checkCoreTablesPopulated,
  checkMigrations,
  checkReferentialIntegrity,
  restorePassed,
  runRestoreChecks,
  type RestoreSnapshot,
} from "./restoreChecks";

const EXPECTED = ["20260820123252_init", "20260901120000_add_clinic_coordinates"];

function snapshot(overrides: Partial<RestoreSnapshot> = {}): RestoreSnapshot {
  return {
    appliedMigrations: [...EXPECTED],
    rowCounts: { Clinic: 2, Doctor: 5, StaffUser: 3, Session: 14, Token: 53 },
    orphanCounts: {},
    invariantViolations: {},
    ...overrides,
  };
}

test("a complete restore passes every check", () => {
  const results = runRestoreChecks(snapshot(), EXPECTED);
  assert.equal(restorePassed(results), true);
  assert.ok(results.every((result) => result.status === "pass"));
});

// The failure that bites hardest: everything works until the first query
// touches a column the backup predates.
test("a restore one migration behind fails", () => {
  const result = checkMigrations(snapshot({ appliedMigrations: [EXPECTED[0]] }), EXPECTED);
  assert.equal(result.status, "fail");
  assert.ok(result.detail.includes("20260901120000_add_clinic_coordinates"));
  assert.ok(result.detail.includes("migrate deploy"), "should say how to fix it");
});

// A backup newer than the checkout is a real situation (restoring
// production into an older branch) and is not a failure.
test("a backup ahead of this checkout warns rather than fails", () => {
  const result = checkMigrations(
    snapshot({ appliedMigrations: [...EXPECTED, "20261001000000_something_later"] }),
    EXPECTED,
  );
  assert.equal(result.status, "warn");
  assert.equal(restorePassed([result]), true, "a warning must not fail the rehearsal");
});

// pg_restore exiting zero proves bytes moved, not that data arrived.
test("an empty core table fails even though the schema restored", () => {
  const result = checkCoreTablesPopulated(snapshot({ rowCounts: { Clinic: 2, Doctor: 0, StaffUser: 3, Session: 14, Token: 53 } }));
  assert.equal(result.status, "fail");
  assert.ok(result.detail.includes("Doctor"));
});

test("a populated database reports what it found", () => {
  const result = checkCoreTablesPopulated(snapshot());
  assert.equal(result.status, "pass");
  assert.ok(result.detail.includes("Token=53"));
});

test("orphaned rows fail the rehearsal", () => {
  const result = checkReferentialIntegrity(
    snapshot({ orphanCounts: { "Tokens with no session": 4, "Doctors with no clinic": 0 } }),
  );
  assert.equal(result.status, "fail");
  assert.ok(result.detail.includes("Tokens with no session: 4"));
  assert.ok(!result.detail.includes("Doctors with no clinic"), "zero-count entries are not violations");
});

test("broken application invariants fail the rehearsal", () => {
  const result = checkApplicationInvariants(
    snapshot({ invariantViolations: { "Listed clinics with no slug": 1 } }),
  );
  assert.equal(result.status, "fail");
  assert.ok(result.detail.includes("Listed clinics with no slug"));
});

test("restorePassed treats any failure as fatal and warnings as not", () => {
  assert.equal(restorePassed([{ name: "a", status: "pass", detail: "" }]), true);
  assert.equal(restorePassed([{ name: "a", status: "warn", detail: "" }]), true);
  assert.equal(
    restorePassed([
      { name: "a", status: "pass", detail: "" },
      { name: "b", status: "fail", detail: "" },
    ]),
    false,
  );
});
