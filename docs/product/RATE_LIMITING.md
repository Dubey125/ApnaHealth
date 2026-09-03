# Rate limiting

What exists, what it actually protects against, and what production needs
instead.

---

## What exists

A fixed-window counter in memory (`src/lib/rateLimit.ts`), applied by
`src/proxy.ts` to unauthenticated mutating routes, and by
`src/app/api/discovery/nearby/route.ts` to itself.

| Route | Limit | Window | Why this one |
|---|---|---|---|
| `POST /login`, `POST /patient/login` | 10 | 5 min | credential stuffing |
| `POST /forgot-password` | 5 | 15 min | each accepted request **sends an email** — an unlimited endpoint that mails a third party on demand is a way to use ApnaHealth to spam someone |
| `POST /reset-password` | 10 | 15 min | the token in the link is all that stands between a guess and an account takeover |
| `POST /patient/register` | 5 | 15 min | account-spam |
| `POST /register/clinic`, `POST /register/doctor` | 5 | 15 min | creates a facility **and** a privileged OWNER account |
| `POST /book/*` | 10 | 5 min | token-spam against a real queue |
| `POST /t/*` | 20 | 5 min | cancellation abuse |
| `GET /api/discovery/nearby` | 60 | 5 min | unauthenticated, two indexed queries per call |

Deliberately **not** limited:

- **`GET /t/[publicId]` polling.** `QUEUE_RULES.md` says polling is
  acceptable, and a patient refreshing their place in a queue is the
  product working.
- **`GET /healthz`.** Uptime monitors need it.
- **The discovery pages** (`/doctors`, `/clinics`, `/hospitals`). Throttling
  them would throttle Googlebot, and being crawled is the point of the SEO
  work. Protection for these belongs at the edge, where a crawler can be
  told apart from an attacker.
- **Everything under `/app` and `/admin`.** Already behind a session.

---

## The limitation

**The counter lives in the memory of one server process.**

On Vercel each serverless instance is a separate process with its own empty
`Map`. So the effective limit is:

```
actual limit  =  configured limit  ×  number of live instances
```

Instances are created and destroyed by the platform in response to traffic —
which means **an attacker generating load is also generating the instances
that raise the ceiling.** Ten concurrent instances turn "10 login attempts
per 5 minutes" into 100, and nothing reports that it happened.

Three further consequences:

- **A cold start resets the window.** An attacker who pauses until an
  instance is recycled starts from zero.
- **Counters are lost, so nothing is observable.** There is no record that a
  limit was ever hit, and therefore no signal that anyone tried.
- **The map is cleared wholesale** at 10,000 tracked keys
  (`MAX_TRACKED_KEYS`), so a flood of distinct IPs resets everyone's
  counter — including the attacker's.

### What it is still worth

It is a real speed bump against the casual and single-source cases:
one script from one IP, an accidental retry loop, a misconfigured client. It
is honest about being that and nothing more, and the comment in
`rateLimit.ts` has always said so.

It is **not** a control against a distributed or determined attacker, and it
must not be presented to a clinic — or a privacy review — as one.

---

## What production should use instead

In order of preference. All three move the counter to shared state and, just
as importantly, somewhere that can be *observed*.

### 1. Edge rate limiting at the platform — recommended

Vercel's WAF/Firewall (or Cloudflare Rate Limiting Rules if the domain sits
behind Cloudflare) applies limits **before a request reaches the
application**, from shared state across the whole edge network.

Why this is the right answer here rather than a library:

- it is enforced once, globally, not per instance;
- an attack costs no application compute, so it cannot bill you for being
  attacked;
- it can distinguish a verified crawler from a bot, which is what makes it
  safe to protect the discovery pages that must stay crawlable;
- it needs **no new dependency**, which `CLAUDE.md` would otherwise require
  approval for.

Suggested starting rules, mirroring the table above:

| Path | Rule |
|---|---|
| `POST /login`, `/patient/login` | 10 per 5 min per IP |
| `POST /forgot-password` | 5 per 15 min per IP |
| `POST /register/*`, `/patient/register` | 5 per 15 min per IP |
| `POST /book/*`, `/t/*` | 20 per 5 min per IP |
| `GET /api/discovery/*` | 60 per 5 min per IP |
| everything else | a generous ceiling, e.g. 300 per min per IP, as a floodwall |

Keep the in-application limiter as well. Defence in depth: it still covers a
request that reaches the app another way, and it is what runs in
development where there is no edge.

### 2. A shared store (Upstash Redis or equivalent)

`@upstash/ratelimit` over serverless Redis is the conventional answer and
would give correct, observable limits inside the application.

**It needs approval**: `CLAUDE.md`'s locked stack names Redis explicitly as
something not to add. It is also a second piece of infrastructure to
provision, pay for and keep available — and if it is unreachable, every
limited route has to decide whether to fail open or closed, which is a new
question the current design does not have.

### 3. Postgres-backed counters

No new dependency, since the database is already there. A `RateLimitBucket`
table with an atomic upsert would be correct and observable.

The cost is a database write on every login attempt — on the exact endpoint
an attacker is hammering, using the same connection pool the clinic's queue
console needs. That is a poor trade on Neon's connection model, and it is
why this is listed third rather than first.

---

## Before the pilot

- [ ] Configure edge rate limiting (option 1) for the routes in the table
- [ ] Confirm the rules do not throttle Googlebot on `/doctors`,
      `/clinics`, `/hospitals` or `/sitemap.xml`
- [ ] Point the edge's rate-limit events at the same place errors go
      (`ERROR_WEBHOOK_URL`, see `docs/product/MONITORING.md`), so a hit
      limit is a signal and not silence
- [ ] Leave the in-application limiter in place
