# Clinic Queue MVP — Build Spec & Prompt Sequence

**Purpose:** a locked specification plus a sequence of prompts you paste into Claude Code, one phase at a time, to build a working live-queue system for Indian OPD clinics.

**Version:** 1.0 · **Status:** ready to build · **Scope:** queue only — no health records, no pharmacy, no ABDM

---

## Part 0 — How to use this document

**Use Claude Code, not the chat window.** Chat can't run your code, so it can't tell whether what it wrote works. Claude Code reads your actual files, runs your actual tests, and sees the actual errors. That difference alone removes most hallucination.

**The single most important step is Phase 0.** It creates a `CLAUDE.md` file in your repo containing the locked spec. Claude Code reads that file automatically at the start of every session. Without it, every new session re-invents your data model and your project drifts into mush by week three.

**Work one phase per session.** Paste one prompt. Let it finish. Verify the acceptance test yourself. Commit. Then start a fresh session for the next phase. Do not paste this entire document at once — long context is where models start filling gaps with plausible fiction.

**Verify, don't trust.** After every phase, you run the acceptance test. If Claude says "the queue now updates correctly" and you haven't seen it update on your own screen, it hasn't happened.

---

## Part 1 — Locked scope

Anything not in this list does not get built in v1. When you feel tempted to add something, add it to a `BACKLOG.md` instead.

### In scope

| # | Capability |
|---|---|
| 1 | Clinic account with staff logins (owner, front desk, doctor) |
| 2 | Doctors and consultation sessions (a doctor sitting at a location on a date) |
| 3 | Token issuing: walk-in at the desk, and patient self-booking via a link |
| 4 | Front-desk console: one-tap "done → call next" |
| 5 | Timestamped event log of every queue action |
| 6 | Arrival-window prediction (baseline algorithm, pluggable) |
| 7 | Public patient status page showing position and predicted window |
| 8 | Prediction snapshot logging (this is your research dataset) |
| 9 | Basic session analytics: median wait, prediction error |

### Explicitly out of scope for v1

Patient medical records · prescriptions · file uploads · ABDM/ABHA integration · payments · pharmacy · labs · blood services · home care · teleconsultation · video · native mobile apps · WhatsApp/SMS notifications · AI/LLM features of any kind · multi-language UI.

Two of these deserve explanation:

- **No medical records.** The moment you store a diagnosis you inherit the full weight of India's data-protection obligations. Names, phone numbers and queue timestamps are a far lighter footprint. Add records later, with an entity and a lawyer.
- **No notifications in v1.** SMS/WhatsApp costs money, needs a registered sender and template approval, and will eat two weeks. Patients refresh a web page in v1. Add notifications after the queue itself is proven.

---

## Part 2 — Locked tech stack

Do not let Claude substitute anything here. If it proposes an alternative, say no.

| Layer | Choice | Why this one |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One codebase for UI and API |
| Database | PostgreSQL | Free tier on Neon or Supabase |
| ORM | Prisma | Schema-as-code, safe migrations |
| Styling | Tailwind CSS | No design system to learn |
| Auth | Hand-rolled cookie session (`bcryptjs` + `jose`) | ~120 lines you fully understand; auth libraries are where LLMs hallucinate most |
| Live updates | HTTP polling every 5 seconds | Websockets break on Indian clinic wifi. Polling just retries. |
| Hosting | Vercel + Neon | Free tier, zero ops |

**Not in v1:** Docker, Redis, microservices, GraphQL, websockets, a mobile app, Kubernetes, a message queue, or any ML framework.

---

## Part 3 — Locked data model

This is the contract. Every phase builds against it. Changing it mid-build is the main way projects like this fall apart.

```
Clinic
  id, name, addressLine, city, phone, timezone (default "Asia/Kolkata"), createdAt

StaffUser
  id, clinicId → Clinic, name, email (unique), passwordHash,
  role: OWNER | FRONT_DESK | DOCTOR, isActive, createdAt

Doctor
  id, clinicId → Clinic, name, specialty,
  registrationNumber (nullable), defaultConsultMinutes (default 6), createdAt

Session                       // one doctor, one location, one day
  id, clinicId, doctorId → Doctor, sessionDate, plannedStartAt, plannedEndAt,
  locationLabel, status: SCHEDULED | OPEN | IN_PROGRESS | PAUSED | CLOSED,
  actualStartAt (nullable), actualEndAt (nullable), createdAt

Token                         // one patient's place in the queue
  id, sessionId → Session, publicId (21-char nanoid, unguessable, unique),
  tokenNumber (int, unique per session), patientName, patientPhone,
  source: WALK_IN | SELF_BOOK,
  status: BOOKED | CHECKED_IN | IN_CONSULT | COMPLETED | NO_SHOW | CANCELLED,
  issuedAt, checkedInAt, consultStartedAt, consultEndedAt (all nullable), createdAt

QueueEvent                    // append-only. Never updated, never deleted.
  id, sessionId, tokenId (nullable), actorStaffUserId (nullable),
  type: TOKEN_ISSUED | CHECKED_IN | CONSULT_STARTED | CONSULT_ENDED
      | MARKED_NO_SHOW | CANCELLED | SESSION_OPENED | SESSION_PAUSED
      | SESSION_RESUMED | SESSION_CLOSED | TOKEN_REORDERED,
  occurredAt, metadata (json)

PredictionSnapshot            // every prediction ever shown to a patient
  id, tokenId → Token, sessionId, modelVersion (string),
  predictedStartAt, windowStartAt, windowEndAt,
  tokensAhead (int), medianServiceSeconds (int), createdAt
```

**Why `QueueEvent` and `PredictionSnapshot` matter more than they look.** `QueueEvent` is your ground truth — if a bug corrupts a `Token` row, the event log lets you reconstruct what actually happened. `PredictionSnapshot` stores every prediction at the moment it was made, so months later you can compare predictions against reality and compute error. That comparison is your entire research contribution. Build it on day one; it is impossible to reconstruct later.

---

## Part 4 — The standing rules block

**Paste this at the top of every single Claude Code session,** before the phase prompt. It is the anti-hallucination harness.

```text
STANDING RULES FOR THIS PROJECT — follow these in every response.

1. Read CLAUDE.md in the repo root before doing anything. It contains the
   locked spec. If my request contradicts CLAUDE.md, stop and tell me.

2. Never invent an API. If you are not certain a function, option or type
   exists in an installed package, check node_modules or the package's
   type definitions first. If you still aren't sure, stop and ask me.
   Do not write plausible-looking code and hope.

3. Build only what the current phase asks for. No extra features, no extra
   files, no "while I was here I also added". If you think something is
   missing, tell me and let me decide.

4. Never claim something works without running it. Run the build, run the
   tests, run the dev server, and paste the real output. If you did not
   run it, say "I have not run this."

5. If a requirement is ambiguous, stop and ask one specific question.
   Do not choose an interpretation and continue.

6. All schema changes go through a Prisma migration. Never edit the
   database directly, never use `db push` on anything but my local machine.

7. TypeScript strict mode. No `any`. No `@ts-ignore`. No disabled lint rules.

8. Do not modify files outside the scope of this phase. If a change is
   needed elsewhere, tell me which file and why before touching it.

9. No new dependencies without asking me first, and state exactly why the
   task cannot be done with what is already installed.

10. At the end of the phase, list: files created, files changed, commands
    you ran, output you saw, and anything you were unsure about.
```

---

## Part 5 — Phase-by-phase prompts

Ten phases. Roughly one evening each.

---

### Phase 0 — Project setup and the spec file

**Goal:** a running empty app and, critically, the `CLAUDE.md` that anchors every later session.

```text
[paste the STANDING RULES block first]

PHASE 0 — Project setup.

Create a new Next.js project in this directory with: TypeScript, App Router,
Tailwind CSS, ESLint, src/ directory, import alias "@/*". Then add Prisma
with a PostgreSQL provider, plus bcryptjs, jose, nanoid, zod, and date-fns.

Then create CLAUDE.md in the repo root containing:
- Project name: Clinic Queue MVP
- One-paragraph description: a live OPD queue system for small Indian
  clinics. Front desk marks consultations complete; patients see their
  position and a predicted arrival window on a public web page.
- The locked tech stack (copy from the table I give you below)
- The locked data model (copy from the schema I give you below)
- The in-scope and out-of-scope feature lists (copy from below)
- A "Conventions" section: server actions for mutations, route handlers for
  the public API, Zod validation at every boundary, all times stored in UTC
  and rendered in Asia/Kolkata, all money/time arithmetic in integers.
- A "Do not do this" section listing: no medical records, no ABDM, no
  notifications, no AI features, no websockets, no new dependencies
  without approval.

[paste Part 2, Part 3 and Part 1 of the build spec here]

Also create BACKLOG.md (empty, with a heading) and a .env.example with
DATABASE_URL and SESSION_SECRET.

Finally: run `npm run build` and show me the real output.
```

**Acceptance test:** `npm run dev` serves a page at localhost:3000. `CLAUDE.md` exists and contains the full data model.

---

### Phase 1 — Database schema

```text
[STANDING RULES]

PHASE 1 — Database schema only. No UI, no API routes.

Write prisma/schema.prisma implementing exactly the data model in CLAUDE.md.
Requirements:
- Use cuid() for all ids except Token.publicId, which uses a 21-character
  nanoid generated in application code (not a Prisma default).
- Enums as named Prisma enums, exactly the values in CLAUDE.md.
- Unique constraint on (sessionId, tokenNumber).
- Index on Token(sessionId, status), QueueEvent(sessionId, occurredAt),
  PredictionSnapshot(tokenId, createdAt).
- Cascade deletes from Clinic down to Session, but NOT from Token to
  QueueEvent — event history must survive.
- All timestamps as DateTime with @db.Timestamptz(3).

Then create the migration and run it against my local database. Then write
prisma/seed.ts creating: one clinic, one OWNER and one FRONT_DESK user with
known passwords, two doctors, and one session today with 12 BOOKED tokens
with realistic Indian patient names.

Run the migration and the seed, then show me the actual output of a query
listing the seeded tokens.
```

**Acceptance test:** open Prisma Studio (`npx prisma studio`) and see 12 tokens.

---

### Phase 2 — Authentication

```text
[STANDING RULES]

PHASE 2 — Staff authentication. Hand-rolled, no auth library.

Implement:
- POST login: email + password, verify with bcryptjs, issue a signed JWT
  using jose, store it in an httpOnly, secure, sameSite=lax cookie named
  "session", 12-hour expiry.
- A getSession() helper for server components that reads and verifies the
  cookie and returns { staffUserId, clinicId, role } or null.
- A requireRole(...roles) helper that redirects to /login when unauthorized.
- Logout that clears the cookie.
- A minimal /login page: email, password, error message. No styling beyond
  Tailwind defaults.
- Middleware protecting /app/* routes.

Every query in this application must be scoped by clinicId from the session.
Write a short note in CLAUDE.md under Conventions stating this rule.

Write tests for getSession with a valid token, an expired token, and a
tampered token. Run them and show me the output.
```

**Acceptance test:** log in with the seeded owner, get redirected to `/app`; edit the cookie by hand and confirm you're kicked to `/login`.

---

### Phase 3 — Clinic, doctors and sessions

```text
[STANDING RULES]

PHASE 3 — Admin CRUD for doctors and sessions. OWNER role only.

Pages:
- /app/doctors — list, add, edit, deactivate doctors
  (name, specialty, registrationNumber, defaultConsultMinutes)
- /app/sessions — list sessions for the next 7 days, create a session
  (doctor, date, planned start, planned end, location label)
- Session status transitions: SCHEDULED → OPEN → IN_PROGRESS → CLOSED,
  plus PAUSED from IN_PROGRESS and back. Implement these as server actions
  that write a QueueEvent for every transition.
- Reject invalid transitions with a clear error. Write a pure function
  isValidTransition(from, to) and unit-test every pair.

Use server actions with Zod validation. Keep the UI plain.
Run the tests and show output.
```

**Acceptance test:** create a session for tomorrow; try to move it straight from `SCHEDULED` to `CLOSED` and confirm it's rejected.

---

### Phase 4 — Token issuing

```text
[STANDING RULES]

PHASE 4 — Issuing tokens.

Two paths into the queue:

A) Walk-in, at the desk (/app/queue, FRONT_DESK and OWNER):
   A form with patient name and phone. On submit, allocate the next
   tokenNumber for that session atomically (use a transaction with a
   SELECT ... FOR UPDATE or an equivalent Prisma transaction — a race
   between two front-desk devices must never produce duplicate numbers),
   create the Token with source WALK_IN and status CHECKED_IN, and write a
   TOKEN_ISSUED plus a CHECKED_IN QueueEvent.

B) Patient self-booking (/book/[sessionId], public, no login):
   Shows doctor name, location, session timing, and how many tokens are
   already issued. Form: name and phone. Creates a Token with source
   SELF_BOOK and status BOOKED. Redirects to /t/[publicId].

Rules:
- Only sessions with status OPEN or IN_PROGRESS accept new tokens.
- Rate-limit self-booking to 3 tokens per phone number per session.
- Never expose Token.id publicly. Only publicId.

Write a test that fires 20 concurrent walk-in submissions and asserts the
token numbers are 1..20 with no duplicates. Run it and show me the output.
```

**Acceptance test:** the concurrency test passes. Open `/book/[id]` in a private window and successfully book without logging in.

---

### Phase 5 — The front-desk console

This is the phase that decides whether your product survives contact with a real clinic. Everything else is replaceable; this screen is the product.

```text
[STANDING RULES]

PHASE 5 — The front-desk console at /app/queue. This is the most important
screen in the product. Read this spec carefully.

Context: a receptionist will use this 40+ times a day while also answering
the phone and handling payments. Every extra tap is a reason to abandon the
system, and if they abandon it every prediction downstream becomes wrong.

Layout — one screen, no navigation, no tabs, no modals:
- Top: session name, doctor, status, and elapsed time of the current
  consultation counting up in real time.
- Middle: a large card for the patient currently IN_CONSULT — token number
  in very large type, name, phone.
- One primary button, occupying at least a quarter of the screen width,
  labelled "Done — call next". Tapping it, in a single transaction:
    ends the current consult (sets consultEndedAt, status COMPLETED,
    writes CONSULT_ENDED), then starts the next waiting token
    (sets consultStartedAt, status IN_CONSULT, writes CONSULT_STARTED).
- Below: the waiting list, compact, showing token number, name, status.
- Secondary actions, small, on each waiting row: mark no-show, cancel.
- Session controls, small, top-right: pause, resume, close.

Interaction rules — these are requirements, not suggestions:
- NO confirmation dialog on the primary button. Instead show an undo toast
  for 10 seconds that reverses the last action.
- Spacebar triggers "Done — call next".
- Optimistic UI: update the screen immediately, then sync. If the request
  fails, roll back visibly and show a retry button. The receptionist must
  never wait on the network.
- The page polls GET /api/sessions/[id]/queue every 5 seconds so a second
  device stays in sync.
- Must be usable one-handed on a 5-inch phone screen.

Implement it. Then walk through the complete flow yourself in the dev server
and paste what you actually observed at each step.
```

**Acceptance test:** issue 5 walk-ins, then complete the whole queue using only the spacebar. Open the same session on your phone and confirm it stays in sync within ~5 seconds.

---

### Phase 6 — Prediction engine v0

```text
[STANDING RULES]

PHASE 6 — Arrival-window prediction. Baseline algorithm only. No machine
learning, no external libraries, no LLM.

Create src/lib/prediction/ with a versioned, pluggable interface:

  type PredictionInput = {
    now: Date
    tokensAhead: number
    currentConsultStartedAt: Date | null
    recentDurationsSeconds: number[]   // completed consults, most recent first
    doctorDefaultMinutes: number
  }
  type PredictionOutput = {
    modelVersion: string
    predictedStartAt: Date
    windowStartAt: Date
    windowEndAt: Date
    medianServiceSeconds: number
  }

Implement modelVersion "baseline-v0" as a PURE function:

1. medianServiceSeconds =
     median of the last 8 durations from this session, if >= 3 exist;
     else median of that doctor's completed consults in the last 30 days,
     if >= 5 exist;
     else doctorDefaultMinutes * 60.
2. remainingCurrent =
     if a consult is in progress, max(0, medianServiceSeconds - elapsed);
     else 0.
3. predictedStartAt = now + remainingCurrent + tokensAhead * medianServiceSeconds
4. eta = seconds from now to predictedStartAt
5. windowStartAt = predictedStartAt - max(300, 0.15 * eta)
   windowEndAt   = predictedStartAt + max(600, 0.35 * eta)

The window is deliberately asymmetric: a patient arriving early waits, a
patient arriving late loses their turn, so the cost is not symmetric.

Recompute for every waiting token on every queue event and on every poll.
Write a PredictionSnapshot row each time a prediction is shown to a patient.

NEVER display a single exact time anywhere in the UI. Windows only.

Write unit tests covering: empty history, fewer than 3 durations, a long
outlier consultation, a paused session, and tokensAhead = 0.
Run them and show the output.
```

**Acceptance test:** unit tests pass; `PredictionSnapshot` rows appear as you work the queue.

---

### Phase 7 — Patient status page

```text
[STANDING RULES]

PHASE 7 — Public patient page at /t/[publicId]. No login.

Shows:
- Token number, very large
- Doctor name, clinic name, location
- "Now serving: token N"
- "You are Nth in line"
- "Estimated arrival window: 4:35 PM – 4:55 PM" — always a window
- A plain-language line: "Leave for the clinic around 4:20 PM"
- Last updated timestamp, refreshing every 10 seconds
- When status is IN_CONSULT: "It's your turn now"
- When COMPLETED, NO_SHOW or CANCELLED: the appropriate terminal message
- A cancel button that sets status CANCELLED and writes a QueueEvent

Constraints:
- No PII other than this patient's own name. Never show other patients'
  names or phone numbers.
- Must render usably on a 3-year-old budget Android phone on a 3G
  connection. No heavy JS, no client-side data fetching library, no fonts
  beyond system fonts. Target under 100KB total transfer.
- Add a rel=noindex meta tag.

Show me the actual transfer size after building.
```

**Acceptance test:** open the link on your own phone over mobile data, not wifi. If it feels slow to you, it will be unusable in a clinic.

---

### Phase 8 — Metrics and the research dataset

```text
[STANDING RULES]

PHASE 8 — Session analytics and research export.

A) /app/sessions/[id]/report (OWNER only), computed from QueueEvent, never
   from mutable Token fields:
   - tokens issued, completed, no-show, cancelled
   - median and 90th-percentile wait (checkedInAt → consultStartedAt)
   - median and 90th-percentile consultation duration
   - session actual vs planned start
   - prediction error: for every token, compare the LAST
     PredictionSnapshot before consultStartedAt against actual
     consultStartedAt. Report median absolute error in minutes, and the
     percentage of patients whose actual start fell inside the predicted
     window ("window hit rate").

B) A CSV export endpoint returning one row per token with: anonymous token
   id, session id, doctor id, tokenNumber, source, all timestamps,
   tokensAhead at prediction, medianServiceSeconds, predicted window, actual
   start, error in seconds. NO names, NO phone numbers.

Window hit rate is the primary metric for this product. Make it the largest
number on the report page.

Write a test with a fixed synthetic session asserting the error maths is
correct. Run it and show the output.
```

**Acceptance test:** run a full fake session, then check the report and confirm the numbers match what you did by hand.

---

### Phase 9 — Simulation, hardening, deploy

```text
[STANDING RULES]

PHASE 9 — Pre-pilot hardening.

1. scripts/simulate.ts — replays a realistic OPD session against the local
   API: 30 patients, log-normal consultation durations (median 6 min, long
   tail to 25 min), 15% no-shows, 20% walk-ins arriving unannounced, one
   10-minute break mid-session. Run it and report the window hit rate from
   the Phase 8 report.
2. Error boundaries on every page; no raw stack traces reaching users.
3. Structured logging of every failed mutation.
4. A /healthz endpoint.
5. Rate limiting on all public routes.
6. Verify every query is scoped by clinicId — list any that are not and fix
   them.
7. Deployment: document exact steps for Vercel + Neon in DEPLOY.md,
   including migration commands and required env vars.

Report the simulated window hit rate. If it is below 60%, tell me — do not
adjust the algorithm to make the number look better.
```

**Acceptance test:** the simulation runs end to end and produces a hit rate. That number is your baseline for the paper.

---

## Part 6 — When Claude goes wrong

Four failure modes and what to say.

**It claims something works but it doesn't.** → *"Run it and paste the actual terminal output. Do not summarize."*

**It rewrites files you didn't ask about.** → *"Revert everything outside [file]. Show me `git diff --stat` before making any further changes."*

**It invents a library API.** → *"Show me where that function is defined in node_modules. If it isn't there, remove it and use what actually exists."*

**It quietly changes the data model.** → *"CLAUDE.md defines the schema. You changed it without asking. Revert and follow the spec."*

Commit after every phase. `git reset --hard` is your undo button, and you will use it.

---

## Part 7 — Things to build with your own hands

Two, and only two, but do these yourself.

**Sit in a clinic before Phase 5.** Watch an OPD session end to end. Count how many times the receptionist is interrupted mid-task. That number determines whether your primary button design is right, and no amount of specification substitutes for seeing it.

**Do a paper dry run before you deploy code.** Give one clinic a printed sheet: token number, arrival time, consult start, consult end. Have them fill it for three days. You will learn more about whether front-desk staff will maintain a queue than a month of building will teach you — and if they won't fill in a paper sheet, they won't tap your button either.

---

## Part 8 — Before real patients touch it

- Get written permission from the clinic owner before running on real patients.
- Do not store any diagnosis, prescription, symptom or medical note. Names, phone numbers and timestamps only.
- Put a plain-language privacy notice on the booking page saying what you store and for how long.
- Set a data-retention rule now: delete patient names and phone numbers after 90 days; keep the anonymised timestamps for research.
- Have a paper fallback ready for the day your app is down, and tell the clinic what it is before you start.
