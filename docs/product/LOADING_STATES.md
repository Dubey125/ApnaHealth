# Loading states and HTTP status

A `loading.tsx` puts its route under an automatic Suspense boundary and
makes the response stream. That is what we want on the slow list pages —
and it is incompatible with `notFound()`.

## The rule

**A route that can call `notFound()` must not have a `loading.tsx`.**

## Why

Streaming flushes the shell as soon as it is ready, which commits the HTTP
status line. `notFound()` thrown afterwards still renders the 404 page, but
the response has already gone out as `200 OK`. That is a soft 404: the page
says "not found" and the protocol says "here is a page", so a crawler
indexes it as real content — directly undoing the canonical/sitemap work in
`src/app/sitemap.ts`.

Measured on this codebase, dev server, Next 16:

| Route | `loading.tsx` | Status for a bad slug |
| --- | --- | --- |
| `/doctors/[slug]` | yes | `200` ← wrong |
| `/doctors/[slug]` | no | `404` |
| `/book/[sessionId]` | no | `404` |
| `/nope` (root not-found) | n/a | `404` |

Calling `notFound()` from `generateMetadata` instead of the page body does
**not** fix it — tested, still `200`.

This is the same root cause as the redirect behaviour already documented in
`src/proxy.ts`: a page under `loading.tsx` cannot turn its own `redirect()`
into a real HTTP redirect once streaming has started, and falls back to a
client-side `<meta refresh>`.

## Where each route stands

Has `loading.tsx` (no `notFound()`, and several sequential queries each):

- `/doctors`, `/clinics`, `/hospitals`
- `/patient/appointments`
- `/app/analytics`, `/app/doctor`, `/app/queue/[sessionId]`

Deliberately has none (calls `notFound()`):

- `/doctors/[slug]`, `/facilities/[slug]`, `/t/[publicId]`, `/book/[sessionId]`

## Getting both

The fix that keeps a skeleton *and* a correct status is to drop
`loading.tsx` and put the Suspense boundary inside the page instead: `await`
the one indexed lookup that decides whether the entity exists (so
`notFound()` can still set the status), then wrap the slower sections —
upcoming sessions, waiting counts, predictions — in `<Suspense>` with their
own fallbacks. Worth doing when those pages get slow enough to need it; the
single-entity lookup they open with is currently fast.
