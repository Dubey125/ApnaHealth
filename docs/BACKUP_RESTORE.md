# Backup and restore

An untested backup is not a backup. This is the rehearsal that turns one
into the other, and it must be performed — and re-performed after any schema
change — before real patient records exist.

This document describes an operational procedure. It makes no claim about
legal or regulatory compliance; see `docs/product/PRIVACY_BOUNDARY.md`.

---

## What the provider gives you

Neon and Supabase both offer point-in-time recovery on their paid tiers.
That is the primary mechanism and it is theirs, not ours. Two decisions are
still yours and neither has been made yet:

- **the retention window** — how far back recovery must reach. This is a
  policy question tied to the retention/deletion policy that
  `PRIVACY_BOUNDARY.md` requires legal review to settle, so it is
  deliberately not answered here;
- **an independent copy** — provider-side PITR does not protect against the
  provider itself, or against an account being lost. A periodic `pg_dump`
  stored somewhere else is what covers that.

Neither is configured. Both belong on the pilot checklist.

---

## The rehearsal

Roughly fifteen minutes. Do it against a **scratch** database, never the
live one, and never with production data on a personal machine — see the
data-handling note at the bottom.

### 1. Take a dump

```bash
pg_dump -h <host> -U <user> -d <database> -Fc -f apnahealth.dump
```

`-Fc` is the custom format: compressed, and restorable selectively. Confirm
the file is a plausible size rather than a few hundred bytes.

### 2. Create a scratch database

```bash
psql -h 127.0.0.1 -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS apnahealth_restore_test;" \
  -c "CREATE DATABASE apnahealth_restore_test;"
```

### 3. Restore into it

```bash
pg_restore -h 127.0.0.1 -U postgres -d apnahealth_restore_test \
  --no-owner --no-privileges apnahealth.dump
```

`--no-owner --no-privileges` because the roles on the production server do
not exist locally, and without them the restore fails on every `ALTER ...
OWNER TO`.

**`pg_restore` exiting zero is not the test.** It proves bytes moved. Step 4
is the test.

### 4. Verify the restore is usable

```bash
RESTORE_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/apnahealth_restore_test" \
  npm run restore:verify
```

Expected output:

```
  [PASS] Schema is current
         All 11 migrations present.
  [PASS] Core tables hold data
         Clinic=2 Doctor=3 StaffUser=5 Session=14 Token=53
  [PASS] Referential integrity
         No orphaned rows.
  [PASS] Application invariants
         All invariants hold.

Restore verified. 0 failed, 0 warnings.
```

The script exits non-zero on any failure, so it can gate a scheduled
rehearsal in CI once there is somewhere safe to run one.

### 5. Destroy the scratch database

```bash
psql -h 127.0.0.1 -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS apnahealth_restore_test;"
rm apnahealth.dump
```

Do not skip this. A restored copy of clinical data sitting on a laptop is
the same data with none of the controls.

---

## What the verification checks, and why each one

`scripts/verify-restore.ts`, with the decision logic in
`src/lib/restoreChecks.ts` (unit tested, no database needed).

| Check | The failure it exists to catch |
|---|---|
| **Schema is current** | A backup one migration behind restores cleanly and works — until the first query touches a column it predates. Here that would be the day someone searches near them. |
| **Core tables hold data** | A restore can move a schema and no rows. Every page renders; everything is empty. |
| **Referential integrity** | A partial restore, or one with constraints deferred, leaves tokens pointing at sessions that are not there. Postgres will not notice until something reads them. |
| **Application invariants** | Rules the schema cannot express: a facility with no slug has no reachable page; a completed consultation with no start time poisons the prediction baseline's median. |

A backup **newer** than the checkout warns rather than fails — restoring
production into an older branch is a legitimate thing to do.

### These were proven to fail, not just to pass

A check that cannot fail is decoration. All four were verified against a
deliberately corrupted restore:

- deleting every `Doctor`, `Session` and `Token` → *Core tables hold data*
  failed, naming all three;
- removing one row from `_prisma_migrations` → *Schema is current* failed,
  naming the migration and the command that fixes it;
- nulling one `Clinic.slug` → *Application invariants* failed with
  `Clinics with no public slug: 1`.

Re-run those three the next time this procedure changes.

---

## Data handling during a rehearsal

The verification script reads only counts — it never selects a patient name,
phone number or clinical note, and it never writes. But **the restored
database itself contains everything.**

So the script is guarded the same way the seed is (`src/lib/seedGuard.ts`),
and refuses to connect unless the target is loopback or its host has been
named explicitly in `RESTORE_ALLOW_HOST`. `NODE_ENV=production` is refused
outright with no override. Verified: a `*.neon.tech` host is refused, and so
is a local host under a production `NODE_ENV`.

That guard is about the operator, not the script. The realistic mistake is
pasting the production connection string to "just check" — and a long
analytical scan against a clinic's database mid-OPD is its own kind of
incident.

Once real patient data exists, a rehearsal should run on a controlled
machine, not a laptop, and the scratch database should be destroyed the same
day.

---

## When to re-run this

- before the pilot begins;
- after any migration that changes or drops a column;
- after changing provider or provider tier;
- on a schedule once real records exist — a backup that has not been
  restored in six months is an assumption, not a control.
