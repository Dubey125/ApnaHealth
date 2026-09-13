# Billing

How a clinic's commercial state works, and — more importantly — what it is
never allowed to do to a patient.

---

## The rule everything else follows

> **Work already promised to a patient is ALWAYS completable.
> Work not yet promised can be withheld.**

A token is a promise. Once one exists, every step downstream of it — check
in, call next, complete the consultation, write the record, close the
session — keeps working in **every** subscription state, including a fully
suspended one.

This is not a courtesy. The obvious implementation of billing enforcement
("subscription lapsed, block the app") is one line of code, and it would
mean a waiting room full of people holding tokens, a doctor mid-consult,
and a receptionist who cannot call the next patient — because a card
expired. A clinic's patients are not party to the commercial relationship
and must never be the leverage in it.

`entitlementsFor()` returns `canOperateExistingQueue: true` as a literal
type, in every branch. A unit test asserts it for every status, and an
e2e test loads a real patient's ticket page against a suspended clinic.
If either fails, an unpaid invoice has reached a waiting room.

---

## States

| Status | New tokens | New sessions / doctors | Analytics | Existing queue |
|---|---|---|---|---|
| `TRIALING` | ✅ | ✅ | ✅ | ✅ |
| `ACTIVE` | ✅ | ✅ | ✅ | ✅ |
| `PAST_DUE` | ✅ | ✅ | ✅ | ✅ |
| `SUSPENDED` | ❌ | ❌ | ❌ | ✅ |
| `CANCELLED` | ❌ | ❌ | ❌ | ✅ |

**`PAST_DUE` changes no behaviour at all.** A failed payment is usually an
expired card, a bank's fraud hold, or an owner on leave — not a customer
who left. The clinic gets a banner and seven days (`GRACE_DAYS`); nothing
about their OPD changes. Only when grace runs out does the account
degrade, and even then today's list still gets finished.

A clinic with **no subscription row at all fails open**
(`UNBILLED_ENTITLEMENTS`). Every clinic predating billing has no row, and
a missing row is our data gap, not their non-payment.

---

## The clock

Trials and grace periods expire on their own, and there is no scheduler in
the locked stack. So `loadClinicBilling()` evaluates the deadline **on
read** and corrects the row when it has fallen behind — the staff layout
calls it on every page load.

A clock-driven change writes a `SubscriptionEvent` with **`actorAdminId`
null**. The audit trail has to be able to say "the system did this" rather
than attributing it to whoever happened to open a page.

---

## Seats

Priced per doctor seat, which tracks the value a clinic actually gets: one
more doctor is one more queue being run. Per-clinic pricing punishes the
single-doctor practice that can least afford it, and usage pricing on
token volume would give a clinic a reason to keep patients *off* the
system on a busy day — exactly backwards.

Seats are enforced **when adding a doctor, never retroactively**. A clinic
that ends up over its allowance (a downgrade, a backfill) keeps every
doctor its patients are booked with and is shown the overage. Silently
delisting a doctor would break bookings patients already hold.

---

## Razorpay

Wired up, and **optional**. Unset the keys and everything still works —
the state machine runs, and a platform admin records payments by hand at
`/admin/subscriptions`. That is what development, CI and a manual pilot do.

### Why the REST API and not the SDK

The SDK wraps the same HTTP calls. The three things it would give us —
Basic auth, JSON, an HMAC check — are a few lines each, and doing them
directly means the payment path has no third-party code in it. No new
dependency, so no `CLAUDE.md` approval needed beyond Razorpay itself.

### Why Subscriptions and not Checkout

A subscription returns a hosted `short_url` the owner is redirected to, so
**no Razorpay JavaScript ever runs on our pages.** Checkout would need
`checkout.razorpay.com` added to `script-src`, widening the exact hole the
nonce-based CSP exists to close.

### The money

| | |
|---|---|
| Price | ₹499/month (`PLAN_PRICE_MINOR.STARTER` = 49900 paise) |
| Trial | 7 days (`TRIAL_DAYS`), charged nothing |
| Seats | 3 doctors on STARTER |

The first charge is deferred with `start_at` to the end of the trial, so a
clinic authorises the mandate today and is billed only when the free days
run out. Without that, "7 days free" would be untrue.

The price shown on `/terms` and `/app/billing` reads the same constant the
charge uses. A clinic quoted one number and charged another is a dispute,
so there is only one number.

### The webhook is the source of truth

`POST /api/webhooks/razorpay`. Nothing marks a clinic as paid except this
endpoint — never a redirect back from a payment page, which is the classic
way to give a product away for free.

It is the only route in the product that changes commercial state without
a session, so:

- **The HMAC signature is the authentication.** Verified against the RAW
  body before anything is read out of it, compared in constant time, and
  failing closed on a malformed or wrong-length signature.
- **It is idempotent.** Razorpay retries until it gets a 2xx and may
  redeliver after success. The claim row is written in the SAME
  transaction as the work — claiming first would mean a transient failure
  left an event marked processed but never applied, silently losing a
  payment.
- **It fails closed.** An unknown event, an unmatched clinic, or a
  transition the state machine forbids is acknowledged and ignored. Never
  guessed at: guessing wrong strands a paying customer or gives the
  product away.
- **2xx on purpose.** A 500 makes Razorpay retry forever, so only a
  signature failure is a 4xx.

### Setting it up

1. Create a **monthly plan at 49900 paise** in the Razorpay dashboard.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`.
3. Create a webhook pointing at `https://<domain>/api/webhooks/razorpay`,
   set a secret, and put it in `RAZORPAY_WEBHOOK_SECRET`. Subscribe to:
   `subscription.activated`, `subscription.charged`, `subscription.pending`,
   `subscription.halted`, `subscription.cancelled`, `subscription.completed`,
   `subscription.resumed`.
4. Use **TEST keys** everywhere but production. A live key in staging
   charges real cards.

`RAZORPAY_WEBHOOK_SECRET` is the only thing between the internet and an
endpoint that marks accounts paid. Treat it like a password, and never
reuse the API key secret for it.

---

## Terms and refunds

`/terms` and `/refunds` are public and in the sitemap — Razorpay's merchant
terms require a published, reachable refund policy.

**Both are engineering drafts and have NOT been reviewed by a lawyer.**
They are written to be honest and readable rather than impenetrable, but
the clauses most likely to need changing are exactly the ones that matter:
liability limits, the no-refund-once-paid rule, and data responsibilities
under the DPDP Act. Indian consumer-protection law may override a blanket
no-refund clause in some circumstances. Get them reviewed alongside the
privacy review `PRIVACY_BOUNDARY.md` already requires.

---

## Manual billing (no provider)

Deliberately. `CLAUDE.md` requires approval before a new dependency, and
the state machine is worth having either way.

`Subscription` holds **no card, bank or payment-instrument data of any
kind** — card handling belongs to a provider, and storing it here would
pull this codebase into PCI scope for nothing. The provider's own
identifiers (`providerCustomerId`, `providerSubscriptionId`) are nullable
and reserved.

Today, a platform admin records a payment at `/admin/subscriptions`. That
is honest for a business with a handful of clinics paying by transfer, and
it is deliberately the **same code path** a provider webhook will call
later — so `canTransition()` and `fieldsForTransition()` are exercised from
day one rather than written twice.

A clinic OWNER can view their subscription but can never change it. It is
ApnaHealth's relationship with them, not theirs with themselves.

---

## Before charging anyone

- [ ] Choose a payment provider (Razorpay is the obvious India default;
      compare pricing, recurring-mandate support and settlement time) and
      get approval to add the dependency
- [ ] Decide actual prices. `PLAN_SEATS` sets seat counts; there are no
      amounts anywhere in this codebase yet, on purpose
- [ ] Write terms of service and a refund policy — neither exists
- [ ] Confirm GST treatment for a SaaS subscription sold to a clinic
- [ ] Test the full lapse-and-recover cycle against a real clinic's data
      in staging, including that recovery clears **both** deadlines
