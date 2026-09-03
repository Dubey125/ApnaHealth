import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { checkSeedTarget } from "../src/lib/seedGuard";
import { runRestoreChecks, restorePassed, type RestoreSnapshot } from "../src/lib/restoreChecks";

// Verifies that a RESTORED database is actually usable.
//
//   RESTORE_DATABASE_URL=postgresql://... npm run restore:verify
//
// It reads. It never writes, never migrates, never seeds. But it is still
// guarded like the seed is, because the way this goes wrong is someone
// pasting the production connection string to "just check" — and a
// long-running analytical query against a live clinic database during OPD
// hours is its own kind of incident.
//
// See docs/BACKUP_RESTORE.md for the rehearsal this is the last step of.

function expectedMigrations(): string[] {
  const directory = join(process.cwd(), "prisma", "migrations");
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function countRows(client: Client, table: string): Promise<number> {
  // Identifier interpolation, not a parameter: table names cannot be bound.
  // The values come from the hardcoded list below, never from input.
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
  return result.rows[0].count as number;
}

async function countQuery(client: Client, sql: string): Promise<number> {
  const result = await client.query(sql);
  return result.rows[0].count as number;
}

const COUNTED_TABLES = ["Clinic", "Doctor", "StaffUser", "Session", "Token", "QueueEvent", "Patient"];

// Foreign keys that no longer resolve. Postgres enforces these live, but a
// restore with constraints deferred, or a partial table-by-table copy, can
// land rows that no longer point anywhere.
const ORPHAN_QUERIES: Record<string, string> = {
  "Tokens with no session":
    'SELECT COUNT(*)::int AS count FROM "Token" t LEFT JOIN "Session" s ON s.id = t."sessionId" WHERE s.id IS NULL',
  "Sessions with no clinic":
    'SELECT COUNT(*)::int AS count FROM "Session" s LEFT JOIN "Clinic" c ON c.id = s."clinicId" WHERE c.id IS NULL',
  "Sessions with no doctor":
    'SELECT COUNT(*)::int AS count FROM "Session" s LEFT JOIN "Doctor" d ON d.id = s."doctorId" WHERE d.id IS NULL',
  "Doctors with no clinic":
    'SELECT COUNT(*)::int AS count FROM "Doctor" d LEFT JOIN "Clinic" c ON c.id = d."clinicId" WHERE c.id IS NULL',
  "Queue events with no session":
    'SELECT COUNT(*)::int AS count FROM "QueueEvent" q LEFT JOIN "Session" s ON s.id = q."sessionId" WHERE s.id IS NULL',
  "Consultation records with no patient":
    'SELECT COUNT(*)::int AS count FROM "ConsultationRecord" r LEFT JOIN "Patient" p ON p.id = r."patientId" WHERE p.id IS NULL',
};

// Rules the schema cannot express but the application depends on.
const INVARIANT_QUERIES: Record<string, string> = {
  "Clinics with no public slug":
    `SELECT COUNT(*)::int AS count FROM "Clinic" WHERE "slug" IS NULL OR "slug" = ''`,
  "Doctors with no public slug":
    `SELECT COUNT(*)::int AS count FROM "Doctor" WHERE "slug" IS NULL OR "slug" = ''`,
  "Tokens with no public id":
    `SELECT COUNT(*)::int AS count FROM "Token" WHERE "publicId" IS NULL OR "publicId" = ''`,
  // The prediction baseline reads completed consultations; one that ended
  // without starting would poison its median service time.
  "Completed tokens that never started":
    `SELECT COUNT(*)::int AS count FROM "Token" WHERE "status" = 'COMPLETED' AND "consultStartedAt" IS NULL`,
  "Consultations ending before they began":
    `SELECT COUNT(*)::int AS count FROM "Token" WHERE "consultEndedAt" IS NOT NULL AND "consultStartedAt" IS NOT NULL AND "consultEndedAt" < "consultStartedAt"`,
};

async function buildSnapshot(client: Client): Promise<RestoreSnapshot> {
  const migrations = await client.query(
    `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at ASC`,
  );

  const rowCounts: Record<string, number> = {};
  for (const table of COUNTED_TABLES) rowCounts[table] = await countRows(client, table);

  const orphanCounts: Record<string, number> = {};
  for (const [description, sql] of Object.entries(ORPHAN_QUERIES)) {
    orphanCounts[description] = await countQuery(client, sql);
  }

  const invariantViolations: Record<string, number> = {};
  for (const [description, sql] of Object.entries(INVARIANT_QUERIES)) {
    invariantViolations[description] = await countQuery(client, sql);
  }

  return {
    appliedMigrations: migrations.rows.map((row) => row.migration_name as string),
    rowCounts,
    orphanCounts,
    invariantViolations,
  };
}

const ICON: Record<string, string> = { pass: "PASS", fail: "FAIL", warn: "WARN" };

async function main(): Promise<void> {
  const databaseUrl = process.env.RESTORE_DATABASE_URL;

  // Deliberately a DIFFERENT variable from DATABASE_URL. Reading the app's
  // own connection string would make the dangerous thing the default.
  if (!databaseUrl) {
    console.error(
      "Set RESTORE_DATABASE_URL to the database you restored the backup into.\n" +
        "  RESTORE_DATABASE_URL=postgresql://... npm run restore:verify\n" +
        "It must not be the production database — see docs/BACKUP_RESTORE.md.",
    );
    process.exitCode = 1;
    return;
  }

  // Reuses the seed's guard: the question is the same one ("is this
  // demonstrably not production?"), and two implementations of that question
  // is how one of them ends up wrong. Its own wording names the seed, so the
  // restore case is stated here in its own words.
  const target = checkSeedTarget({
    databaseUrl,
    nodeEnv: process.env.NODE_ENV,
    allowHost: process.env.RESTORE_ALLOW_HOST,
  });
  if (!target.allowed) {
    console.error(
      "Refusing to connect: this target is not demonstrably a non-production database.\n\n" +
        "  A restore rehearsal belongs in a scratch database, never the live one. Even a read-only\n" +
        "  check: a long analytical scan against a clinic mid-OPD is its own kind of incident.\n\n" +
        "  If the restore really is a throwaway remote database, name its host explicitly:\n" +
        "    RESTORE_ALLOW_HOST=<host> RESTORE_DATABASE_URL=... npm run restore:verify\n\n" +
        `  Underlying check: ${target.reason.split("\n")[0]}`,
    );
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log(`Verifying the restored database on ${target.host}.\n`);

  try {
    const snapshot = await buildSnapshot(client);
    const results = runRestoreChecks(snapshot, expectedMigrations());

    for (const result of results) {
      console.log(`  [${ICON[result.status]}] ${result.name}`);
      console.log(`         ${result.detail}`);
    }

    const passed = restorePassed(results);
    console.log(
      `\n${passed ? "Restore verified." : "RESTORE NOT USABLE."} ` +
        `${results.filter((r) => r.status === "fail").length} failed, ` +
        `${results.filter((r) => r.status === "warn").length} warnings.`,
    );
    if (!passed) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
