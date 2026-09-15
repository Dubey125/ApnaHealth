import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Is the database behind DATABASE_URL ready for the code in this checkout?
//
// This exists because of a near miss. Every migration in this repository
// had been applied to the DEVELOPMENT database and none to production,
// while the production deployment ran a commit from before any of them.
// Merging would have deployed code that queries Subscription,
// PatientAllergy, PrescribedMedicine, Token.visitType and a dozen other
// things that do not exist there — which is not a degraded feature, it is
// every page returning 500.
//
// `next build` deliberately does NOT run migrations: the build is proven
// to work against an unreachable database (see .github/workflows/ci.yml),
// which is what stops a page quietly acquiring a build-time query. That
// guarantee is worth keeping, so applying migrations stays a deliberate
// act — and this makes forgetting it loud instead of catastrophic.
//
// Read-only. It applies nothing, changes nothing, and never prints a
// credential.
//
//   npm run migrate:check                        (whatever DATABASE_URL says)
//   DATABASE_URL="<production URL>" npm run migrate:check

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

function migrationsInRepository(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}/${parsed.pathname.replace(/^\//, "").split("?")[0]}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log(`target: ${describeTarget(url)}\n`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 1, connectionTimeoutMillis: 20_000 }),
  });

  let applied: string[];
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name
    `;
    // A row with no finished_at is a migration that started and did not
    // complete. Treating it as applied would be the worst possible answer:
    // the schema is in an unknown half-state.
    const unfinished = rows.filter((row) => row.finished_at === null).map((row) => row.migration_name);
    if (unfinished.length > 0) {
      console.error(`FAIL: ${unfinished.length} migration(s) started but never finished:`);
      for (const name of unfinished) console.error(`  ${name}`);
      console.error("\nThe schema is in an unknown state. Do not deploy. Resolve these first.");
      process.exit(1);
    }
    applied = rows.map((row) => row.migration_name);
  } catch (error) {
    // No _prisma_migrations table at all means the database has never been
    // migrated — a real answer, not a crash.
    const message = error instanceof Error ? error.message : String(error);
    if (/_prisma_migrations/.test(message)) {
      console.error("FAIL: this database has no migration history at all.");
      console.error(`  ${migrationsInRepository().length} migrations in this checkout have never been applied.`);
      process.exit(1);
    }
    console.error(`FAIL: could not read migration history — ${message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  const expected = migrationsInRepository();
  const pending = expected.filter((name) => !applied.includes(name));
  // Migrations applied to the database that this checkout does not contain.
  // Usually means the code is OLDER than the database — deploying it could
  // run queries against a schema that has moved on.
  const unknown = applied.filter((name) => !expected.includes(name));

  console.log(`migrations in this checkout: ${expected.length}`);
  console.log(`applied to this database:    ${applied.length}`);

  if (unknown.length > 0) {
    console.log(`\nWARN: ${unknown.length} migration(s) applied here are not in this checkout:`);
    for (const name of unknown) console.log(`  ${name}`);
    console.log("  This code may be older than the database.");
  }

  if (pending.length === 0) {
    console.log("\nPASS: every migration in this checkout is applied. Safe to deploy this code here.");
    return;
  }

  console.error(`\nFAIL: ${pending.length} migration(s) NOT applied to this database:`);
  for (const name of pending) console.error(`  ${name}`);
  console.error("\nDeploying this code against this database would fail at runtime.");
  console.error("Apply them first, from a trusted machine:");
  console.error('  DATABASE_URL="<that database>" npx prisma migrate deploy');
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
