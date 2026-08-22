# Deployment

Target: Vercel + Neon or Supabase PostgreSQL (the locked stack — see CLAUDE.md).
This document does not claim regulatory compliance of any kind; see the
"Unresolved concerns" section at the bottom and PRIVACY_BOUNDARY.md before
any real-patient pilot.

## 1. Provision the database

1. Create a Postgres database on Neon or Supabase.
2. Copy its connection string. Append `connect_timeout=30` — Neon's serverless
   cold start is otherwise prone to timing out Prisma's migration engine.
3. If the provider's default `sslmode` is `require`/`prefer`, that's fine for
   now; a future `pg` major version will change what those aliases mean
   (see the warning `pg` prints on connect) — revisit before then.

## 2. Environment variables

Set these in the Vercel project's Environment Variables settings (Production
and Preview both need them):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | The connection string from step 1. |
| `SESSION_SECRET` | yes | `openssl rand -base64 32`. Must be at least 32 characters — validated at server boot (`src/instrumentation.ts` calls `validateEnv()`), so a missing or weak secret fails the deployment immediately instead of surfacing as a confusing error on the first login attempt. |

Never commit `.env`. `.env.example` documents the shape without real values.

## 3. Run migrations against production

```
DATABASE_URL="<production URL>" npx prisma migrate deploy
```

- Use `migrate deploy`, never `migrate dev` or `db push`, against a shared
  database (CLAUDE.md: "Do not use db push on shared/staging/production").
- Do this from CI/a trusted machine, not from a Vercel build step, so a
  failed migration doesn't half-apply during a live deploy.

## 4. Never run the seed script against production

`prisma/seed.ts` is idempotent by *deleting and recreating* a clinic named
"Apna Health Test Clinic" — it exists purely for local development and the
live-verification testing done during this project's phased build. Do not
run `npx prisma db seed` (or anything that imports `prisma/seed.ts`) against
a production `DATABASE_URL`, ever.

## 5. Deploy

Standard Vercel Next.js deployment — connect the repo, Vercel detects
Next.js automatically. Build command and output are the framework defaults;
no custom build step is required beyond `prisma generate`, which Vercel's
Next.js/Prisma integration runs automatically when `prisma` is a
dependency (confirm this ran in the build log on the first deploy).

## 6. Health check

`GET /healthz` — unauthenticated, checks the database is reachable
(`SELECT 1`), returns `{"status":"ok"}` (200) or `{"status":"error"}` (503).
No stack trace, connection string, or other detail is ever included in the
response. Point Vercel's / your uptime monitor's health check at this path.

## 7. Logging

Errors are logged as single-line structured JSON via `console.error`
(`src/lib/log.ts`), picked up automatically by Vercel's log stream / any log
drain you attach. Deliberately excludes request bodies, cookies, and
headers — only `path`, `method`, and Next's internal `routeType` are
attached to server-side errors (wired via `src/instrumentation.ts`'s
`onRequestError`). Expected control flow (`redirect()`, `notFound()`) is
filtered out so the log isn't dominated by non-errors.

## 8. Known limitation: rate limiting is per-instance, in-memory

`src/proxy.ts` rate-limits the public mutating routes (staff/patient login,
patient registration, self-booking, ticket cancellation) using an in-memory
counter (`src/lib/rateLimit.ts`). This is intentional — the locked stack
forbids adding Redis without explicit approval (CLAUDE.md) — but it means:

- Each serverless instance/cold start gets its own counter. Under real
  multi-instance production traffic, the effective limit is
  `configured limit × (number of warm instances currently serving traffic)`,
  not a hard global cap.
- It resets on every cold start / redeploy.

Treat it as a speed bump against casual abuse and scripted spam, not a
guarantee. If real abuse shows up in production, the fix is a shared store
(Vercel's own rate limiting product, or Upstash Redis) — get that approved
before adding it, per the locked-stack rule.

## 9. Rollback

Use Vercel's deployment history to instantly roll back the app to a
previous deployment. Database migrations are not automatically rolled back
by this — a schema change that a rolled-back app version can't handle
needs a hand-written down-migration or a forward-fix, decided at the time
based on what actually changed. Never `prisma migrate reset` in production
under any circumstance.

## Unresolved concerns (see also PRIVACY_BOUNDARY.md)

- **Rate limiting is not multi-instance safe** (§8 above).
- **No WAF / bot protection** beyond the app-level rate limiter — a
  determined attacker distributing requests across many IPs isn't slowed
  down by it.
- **No automated dependency vulnerability scanning** is configured in CI
  (there is no CI pipeline defined in this repository yet).
- **No backup/retention policy** is defined for the database — Neon/Supabase
  both offer point-in-time recovery, but which retention window is
  appropriate for medical records has not been decided; PRIVACY_BOUNDARY.md
  explicitly defers this to a future legal/privacy review before any real
  -patient pilot.
- **No formal incident-response process** exists yet.
- This document, and this codebase, make **no claim of HIPAA, DPDP Act, or
  any other regulatory compliance**. PRIVACY_BOUNDARY.md is explicit that a
  qualified legal/privacy review is required before a real-patient pilot.
