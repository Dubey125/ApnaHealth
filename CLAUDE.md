# Healthcare MVP — Claude Code Project Rules

## Source of truth
This repository implements the first MVP of the healthcare startup:
1. Doctor discovery
2. Verified doctor profile
3. Appointment / digital serial
4. Live queue tracking
5. Basic patient medical record
6. Doctor dashboard

Read this file before every task. Then read only the current phase file requested by the user, plus whichever `docs/product/*.md` that phase file points you to.

Detailed specs live under `docs/`:
- `docs/claude-phases/PHASE-00.md` … `PHASE-11.md` — the functional MVP, one phase per file, read only the current one.
- `docs/claude-phases/PHASE-12.md` … `PHASE-18.md` — the UI/UX design-system pass on top of the functional MVP. Same one-phase-per-file discipline; each also points at `docs/product/DESIGN_SYSTEM.md`.
- `docs/product/MVP_SPEC.md` — roles, pages, non-goals.
- `docs/product/DATA_MODEL.md` — the locked Prisma data model contract.
- `docs/product/ACCESS_MATRIX.md` — who can do what.
- `docs/product/QUEUE_RULES.md` — token issuing, session transitions, prediction baseline.
- `docs/product/PRIVACY_BOUNDARY.md` — clinical/privacy boundaries.

## Locked stack
- Next.js App Router + TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- Zod
- bcryptjs + jose
- cuid internal IDs; nanoid public ticket IDs
- HTTP polling for queue updates
- Vercel + Neon/Supabase PostgreSQL

Do not add Redis, WebSockets, GraphQL, microservices, Kubernetes, native apps, or AI/LLM features unless explicitly approved.

## Scope
In MVP: doctor discovery, doctor verification workflow, sessions, digital serials, walk-ins, live queue, baseline queue prediction, patient accounts, basic clinician-authored consultation records, access/consent logging, doctor dashboard, front-desk console, owner/admin functions, analytics and anonymized research export.

Out of MVP: pharmacy, labs, blood services, home care, telemedicine/video, payments, insurance, ABDM/ABHA, OCR, autonomous diagnosis, AI prescribing, AI chatbot, native mobile apps, public ratings/reviews, advertising, emergency triage.

Put future ideas in BACKLOG.md.

## Security rules
- Multi-tenant: every protected query is scoped by clinicId.
- Server-side authorization is the security boundary.
- Validate external input with Zod.
- Never expose internal IDs in public URLs.
- Never expose another patient's data.
- Never expose medical records through public endpoints.
- Record access must be auditable.
- Doctor verification must never be fabricated or treated as automatic truth.
- Use secure httpOnly cookies for sessions.
- No sensitive information in logs.

## Data/time rules
- Store timestamps in UTC.
- Render using the clinic timezone (default Asia/Kolkata).
- Queue time is an estimate; display windows, not exact guarantees.
- QueueEvent is append-only.
- PredictionSnapshot stores patient-visible prediction history.

## Coding rules
- TypeScript strict mode.
- No `any`, `@ts-ignore`, or disabled lint rules.
- All schema changes use Prisma migrations.
- Do not use db push on shared/staging/production.
- No new dependency without approval.
- Do not silently change the locked data model.
- Do not modify files outside the current phase without reporting why.
- Never claim something works without running the relevant command.
- If an API/library behavior is uncertain, inspect installed types/source first.
- Keep one implementation phase per Claude Code session.

## Required phase report
At the end of every phase report:
- files created
- files changed
- files intentionally untouched
- commands run
- test/typecheck/lint/build results
- actual errors
- known limitations
- next recommended phase

## Product safety boundary
This is a coordination and record-keeping MVP, not an autonomous doctor. Clinical decisions remain with qualified healthcare professionals.

## Prisma 7 / Next.js 16 notes
This project runs on Prisma 7 and Next.js 16, both of which have breaking changes versus older training data:
- `prisma.config.ts` (not `package.json#prisma`) holds the datasource URL and migration seed command; the schema's `datasource` block must NOT have a `url` field.
- The Prisma client generator is `prisma-client` (not `prisma-client-js`), output to `src/generated/prisma`. `PrismaClient` requires an explicit driver adapter (`@prisma/adapter-pg` for Postgres) — it no longer reads `DATABASE_URL` implicitly.
- The generated client's relative imports are extension-less and only resolve under a bundler; standalone scripts (e.g. `prisma/seed.ts`) run via `tsx`, not plain `node`.
- Read `AGENTS.md` and `node_modules/next/dist/docs/` before writing App Router / server action code you're not certain about.
