// What "the backup restored successfully" actually has to mean.
//
// `pg_restore` exiting zero proves bytes moved. It does not prove the
// database is usable: a restore can complete against a schema one migration
// behind, or with a table silently empty, or with foreign keys that no
// longer resolve — and every one of those looks like success until a clinic
// opens the app.
//
// These are the assertions that make a rehearsal meaningful. They are pure
// functions over already-fetched counts so they can be unit tested without
// a database; scripts/verify-restore.ts does the querying.

export type CheckStatus = "pass" | "fail" | "warn";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface RestoreSnapshot {
  /** Migration names recorded in _prisma_migrations, in application order. */
  appliedMigrations: string[];
  /** Row counts per table, as reported by the restored database. */
  rowCounts: Record<string, number>;
  /** Referential-integrity violations found, keyed by a human description. */
  orphanCounts: Record<string, number>;
  /** Rows breaking an application invariant, keyed by a human description. */
  invariantViolations: Record<string, number>;
}

/** Tables that being empty means the restore did not bring the data across. */
const CORE_TABLES = ["Clinic", "Doctor", "StaffUser", "Session", "Token"];

/**
 * Compare the restored database against the migrations this build expects.
 *
 * A restore one migration behind is the failure mode that bites hardest:
 * everything works until the first query touches a column the backup
 * predates, which in this app would be the day someone searches near them.
 */
export function checkMigrations(snapshot: RestoreSnapshot, expected: string[]): CheckResult {
  const applied = new Set(snapshot.appliedMigrations);
  const missing = expected.filter((migration) => !applied.has(migration));
  const extra = snapshot.appliedMigrations.filter((migration) => !expected.includes(migration));

  if (missing.length > 0) {
    return {
      name: "Schema is current",
      status: "fail",
      detail:
        `The restored database is missing ${missing.length} migration(s) this build expects: ` +
        `${missing.join(", ")}. Run \`prisma migrate deploy\` against the restored database before trusting it.`,
    };
  }
  if (extra.length > 0) {
    return {
      name: "Schema is current",
      status: "warn",
      detail:
        `The restored database has ${extra.length} migration(s) this build does not know about ` +
        `(${extra.join(", ")}). The backup is newer than this checkout.`,
    };
  }
  return {
    name: "Schema is current",
    status: "pass",
    detail: `All ${expected.length} migrations present.`,
  };
}

/**
 * A restore that produced an empty core table moved a schema, not a backup.
 * Reported as a failure rather than a warning: nobody rehearses a restore
 * hoping to find out the tables are empty.
 */
export function checkCoreTablesPopulated(snapshot: RestoreSnapshot): CheckResult {
  const empty = CORE_TABLES.filter((table) => (snapshot.rowCounts[table] ?? 0) === 0);
  if (empty.length > 0) {
    return {
      name: "Core tables hold data",
      status: "fail",
      detail: `These tables restored empty: ${empty.join(", ")}.`,
    };
  }
  const summary = CORE_TABLES.map((table) => `${table}=${snapshot.rowCounts[table]}`).join(" ");
  return { name: "Core tables hold data", status: "pass", detail: summary };
}

/**
 * Foreign keys that no longer resolve.
 *
 * A partial restore — one table's data missing, or restored in the wrong
 * order with constraints deferred — leaves tokens pointing at sessions that
 * are not there. Postgres will not notice until something reads them.
 */
export function checkReferentialIntegrity(snapshot: RestoreSnapshot): CheckResult {
  const broken = Object.entries(snapshot.orphanCounts).filter(([, count]) => count > 0);
  if (broken.length > 0) {
    return {
      name: "Referential integrity",
      status: "fail",
      detail: broken.map(([description, count]) => `${description}: ${count}`).join("; "),
    };
  }
  return { name: "Referential integrity", status: "pass", detail: "No orphaned rows." };
}

/**
 * Invariants the schema cannot express but the application relies on —
 * a listed facility with no slug has no reachable public page, a completed
 * consultation with no start time breaks the prediction baseline.
 */
export function checkApplicationInvariants(snapshot: RestoreSnapshot): CheckResult {
  const broken = Object.entries(snapshot.invariantViolations).filter(([, count]) => count > 0);
  if (broken.length > 0) {
    return {
      name: "Application invariants",
      status: "fail",
      detail: broken.map(([description, count]) => `${description}: ${count}`).join("; "),
    };
  }
  return { name: "Application invariants", status: "pass", detail: "All invariants hold." };
}

export function runRestoreChecks(snapshot: RestoreSnapshot, expectedMigrations: string[]): CheckResult[] {
  return [
    checkMigrations(snapshot, expectedMigrations),
    checkCoreTablesPopulated(snapshot),
    checkReferentialIntegrity(snapshot),
    checkApplicationInvariants(snapshot),
  ];
}

/** A rehearsal passes only when nothing failed. Warnings are reported, not fatal. */
export function restorePassed(results: CheckResult[]): boolean {
  return results.every((result) => result.status !== "fail");
}
