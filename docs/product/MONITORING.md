# Error monitoring

Before this, an error became a line of JSON on stdout. On Vercel that is
retained briefly, is not alerted on, and nobody reads it — so the way a
failure actually surfaced was a clinic telephoning to say the queue console
had stopped working. That is the worst possible monitoring system: the
detector is a person having a bad day.

---

## How it works

`src/lib/monitoring.ts` exposes `reportError(error, context)`. It **always**
logs to the console, exactly as before, and additionally POSTs a small JSON
report to `ERROR_WEBHOOK_URL` when one is configured.

Wired into every place an error is currently caught:

- `src/instrumentation.ts` → `onRequestError`, which Next calls for uncaught
  exceptions in Server Components, Route Handlers, Server Actions and the
  proxy;
- `GET /api/discovery/nearby` and `GET /healthz`, which catch their own.

### Why a webhook and not Sentry

`CLAUDE.md` forbids new dependencies without approval, and a vendor SDK is a
large one. A JSON POST reaches Slack, Discord, a serverless function, an
existing log pipeline — anything that can receive one. Sentry remains a
perfectly good later choice; the point of this is that *no monitoring* stops
being the status quo while that decision is pending.

---

## The four rules it follows

Each exists because monitoring that misbehaves makes an outage worse.

**It never throws.** Every failure path is caught and swallowed. A failure
to *report* an error must not become a second error.

**It never blocks.** The webhook call is not awaited, and carries a 3-second
timeout. A slow monitoring endpoint must not become a slow clinic.

**It never floods.** Identical errors are collapsed to one report per
5-minute window, and distinct errors are capped at 20 per window. Without
this, a route failing on every request sends a webhook per request — which
buries the signal and can get the receiving endpoint rate limited exactly
when it matters.

**It never leaks.** The payload carries the message, a hashed fingerprint,
the Next digest, and whatever `LogContext` the caller explicitly passed.
Never a stack, never a request body, never cookies, never patient data —
the same rule `src/lib/log.ts` has always followed.

A representative payload:

```json
{
  "message": "Database unreachable",
  "fingerprint": "71545ad29b88f7d0",
  "context": { "path": "/doctors", "method": "GET" },
  "environment": "production",
  "occurredAt": "2026-09-01T12:00:00.000Z"
}
```

### The fingerprint is hashed, and that was a real fix

Deduplication needs to know when two errors are "the same", which means
including the first stack frame — and a raw first frame is an absolute
source path like `E:\ApnaHealth\src\lib\...`. That would have shipped the
server's filesystem layout to a third-party webhook on every report.

A unit test caught it before it shipped. The fingerprint is now a 64-bit
FNV-1a of route + message + first frame: it distinguishes errors just as
well, and reveals nothing.

FNV-1a rather than SHA-256 because this code is bundled for the **edge**
runtime too (`onRequestError`), where `node:crypto` does not exist — and
Web Crypto's digest is async, which would make fingerprinting async all the
way up. A non-cryptographic hash is the right tool for telling errors apart
anyway. The `node:crypto` version surfaced as "Ecmascript file had an error"
in a build that still exited zero, so it would otherwise have shipped.

---

## Setting it up

```
ERROR_WEBHOOK_URL=https://hooks.example.com/services/...
```

Unset, nothing is forwarded and the console line is still written — so this
is safe to leave blank in development, which is the default.

Where to point it, cheapest first:

1. **A Slack or Discord incoming webhook.** Zero infrastructure. The payload
   will not render as a formatted message without a small transform, but it
   arrives and it is readable.
2. **A serverless function you own**, which reformats and forwards. Gives
   you somewhere to add throttling, routing by severity, or paging.
3. **A log pipeline** (Better Stack, Axiom, Datadog) that accepts JSON over
   HTTP. This is the option that gets you search and alerting.

---

## What this is not

It is **error reporting, not observability.** There are no metrics, no
traces, no uptime checks, no alerting rules. In particular:

- nobody is paged. A webhook into a channel is only seen if someone is
  looking at the channel;
- there is no uptime monitor. `/healthz` exists and answers, but nothing
  polls it. A monitor pointed at it is a five-minute setup and belongs on
  the pilot checklist;
- rate-limit hits are not reported (see `docs/product/RATE_LIMITING.md`),
  because the in-memory limiter has no shared state to report from.

For a single-clinic pilot, a webhook into a channel that a named person
checks each morning is a reasonable place to start — provided that person
exists and knows it is their job. Name them before the pilot, not after the
first incident.
