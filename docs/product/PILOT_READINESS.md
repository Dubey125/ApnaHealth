# Real-clinic pilot readiness

An assessment of what is ready, what is not, and what only a human can
decide. Written against the state of the repository at the end of the
discovery/UX workstream.

**Bottom line: the software is close. The governance is not started.** The
blocking items below are almost entirely non-engineering, and no amount of
further code changes that.

---

## 1. The hard gate

`PRIVACY_BOUNDARY.md` says, in the repository's own words:

> Before real-patient pilot, obtain qualified legal/privacy review covering
> notices, consent/access, retention/deletion, backups, audit retention,
> security controls, incident response, professional verification,
> clinic/provider responsibilities and applicable Indian data/health
> requirements.

Nothing in this document overrides that, and nothing in the codebase
satisfies it. A pilot that puts real patient data in this system before that
review is not a technical risk decision, it is a legal one, and it is not
mine to make or to sign off.

Two related rules that engineering **has** honoured and must continue to:

- **Doctor verification is never fabricated.** No code path sets
  `verificationStatus = VERIFIED` without a human recording a check against
  a named source. The structured data deliberately does not emit
  verification as a credential or award.
- **No retention period is hard-coded.** `PRIVACY_BOUNDARY.md` forbids it
  until review is complete, and none exists.

---

## 2. What is ready

| Area | State |
|---|---|
| Multi-tenant isolation | Every protected query scoped by `clinicId`; the one deliberate exception (`/admin`) never reads clinical data |
| Public listing boundary | Single definition in `src/lib/publicListing.ts`, applied by every public read, contract-tested |
| Patient data isolation | Appointment and record reads scoped by `patientId` in the `where`, not checked after the read |
| Authentication | httpOnly cookies, signed sessions, boot-time `SESSION_SECRET` validation, separate cookies per account kind |
| Authorization | Server-side at page and action level; `proxy.ts` is defence in depth, not the boundary |
| Audit trail | `QueueEvent`, `AuditEvent`, `RecordAccessEvent` append-only; patient-initiated cancellation lands in the same log a front-desk one would |
| Input validation | Zod on external input; photo URLs validated against protocol and host rules |
| Security headers | Nonce-based CSP (no `'unsafe-inline'` for scripts), HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Seed safety | Refuses any non-loopback host and any production `NODE_ENV` |
| Tests | 241 unit + 58 end-to-end, run by CI on every push |
| Error reporting | Forwarded to a configured webhook, throttled, carrying no stack or patient data |
| Backup verification | `npm run restore:verify`, with a rehearsal procedure that has been performed |
| Deploy safety | Build no longer requires a reachable database |

---

## 3. Engineering work still required before a pilot

Ordered by how much it would hurt to skip.

### 3.1 Patient data access and deletion — **BLOCKED pending policy**

There is still no way for a patient to export their data or close their
account. Under India's DPDP Act a data principal has rights of access and
erasure, and a privacy review will ask about both.

Deliberately not built. It is not "delete the rows": a consultation record
is the *clinic's* medical record as well as the patient's, and clinics have
their own retention duties. What erasure means when one row serves two
obligations is a policy question, and building an answer before the review
gives one would be inventing the policy in code.

**No medical-record deletion semantics have been changed.**

### 3.2 Rate limiting is per-instance — **documented, edge solution specified**

Fully written up in `docs/product/RATE_LIMITING.md`, including the arithmetic
(`limit x instances`), what the in-memory limiter is and is not worth, and
the recommended edge-based production configuration with starting rules.
Configuring it at the edge remains a deployment task.

### 3.3 Backup and restore — **procedure and verification now exist**

`docs/BACKUP_RESTORE.md` documents the full rehearsal, and
`npm run restore:verify` checks that a restored database is actually usable
rather than merely present. Performed end to end against a scratch database,
and all four checks were proven to FAIL against deliberate corruption.

Still outstanding and not an engineering task: choosing a retention window,
and configuring an independent copy beyond provider-side PITR.

### 3.4 Error aggregation — **built**

`reportError()` forwards to `ERROR_WEBHOOK_URL`, throttled and non-blocking,
carrying no stack or patient data. See `docs/product/MONITORING.md`.

Still outstanding: nobody is paged, and nothing polls `/healthz`. A named
person and an uptime monitor belong on the checklist below.

### 3.5 CSP — **hardened to a per-request nonce**

`script-src` no longer carries `'unsafe-inline'`. `proxy.ts` issues a fresh
nonce per request and Next stamps it on every script it emits; an injected
script has no nonce and does not run. Verified: 100% of script tags on every
public page carry it, including the JSON-LD blocks that a strict policy
would otherwise silently discard.

`style-src` still allows inline, deliberately: React renders `style={{...}}`
as style *attributes*, which this app uses for computed positions (the map's
tile and pin placement is arithmetic). A nonce cannot cover an attribute.
CSS injection can restyle a page, not execute code.

### 3.6 Client-side behaviour is not automatically tested

The e2e suite is HTTP-level and cannot exercise the geolocation prompt, the
two-step cancel confirmation, or in-browser distance calculation. Those are
manually verified only. Playwright would close it, at the cost of a new
dependency.

---

## 4. Operational readiness

### 4.1 Configuration

`productionConfigWarnings()` now reports, at boot, configuration that is
*wrong* rather than missing:

- `SITE_URL` unset or pointing at localhost — every canonical link, sitemap
  entry and social card would claim the site lives on localhost;
- `RESEND_API_KEY` unset — `/forgot-password` refuses every request, so
  nobody can recover an account;

These warn rather than fail. An unset `SITE_URL` is an SEO problem, not a
reason to take a clinic offline mid-session.

### 4.2 The demo data must not reach production

The seed refuses non-loopback hosts and production `NODE_ENV`
(`src/lib/seedGuard.ts`). The pilot clinic's real data must be entered
through the product's own screens — facility registration, doctor creation,
verification recorded by a human against a named source.

### 4.3 Facilities need coordinates

A facility with no latitude/longitude is fully listed but invisible to
"search near you". `npm run clinic:location -- --missing` reports which,
and `/admin/facilities` badges them.

---

## 5. What the founder must do — from `MANUAL_FOUNDER_WORK.md`

These were written before this workstream and remain outstanding. They are
not engineering tasks and cannot be discharged by code:

- observe a real OPD workflow, and run a paper queue dry run;
- obtain **written** clinic permission and name a clinic contact;
- define the software-outage fallback (the clinic must be able to run its
  session when this app is down — that is a paper process, agreed in
  advance, not a feature);
- manually verify each participating doctor and record source, date and
  evidence;
- obtain the privacy/legal review;
- define retention, deletion and backup policy.

And during the pilot: measure baseline versus post-pilot waiting time,
prediction-window hit rate, no-show rate, and satisfaction — and
**do not claim the product reduces waiting unless the pilot evidence
supports it.**

---

## 6. Go / no-go checklist

Every line must be true before a real patient's data is entered.

**Legal and clinical**
- [ ] Qualified privacy/legal review completed
- [ ] Retention, deletion and backup policy defined and implemented
- [ ] Written clinic permission obtained; clinic contact named
- [ ] Every participating doctor verified by a human, with evidence recorded
- [ ] Patient-facing privacy notice published and linked
- [ ] Software-outage fallback agreed in writing with the clinic

**Engineering**
- [ ] Patient data export and account closure built (§3.1) — **BLOCKED on
      the privacy/legal review; do not build until it answers**
- [ ] Backup restored into a scratch database and confirmed usable —
      procedure is `docs/BACKUP_RESTORE.md`, run it against a real backup
- [ ] Retention window chosen, and an independent copy configured beyond
      provider-side PITR (§3.3)
- [ ] `ERROR_WEBHOOK_URL` set, and a named person who reads it (§3.4)
- [ ] An uptime monitor pointed at `/healthz`
- [ ] Edge rate limiting configured (`docs/product/RATE_LIMITING.md`), and
      confirmed not to throttle Googlebot on the discovery pages
- [ ] `SITE_URL` and `RESEND_API_KEY` set; boot warnings clear
- [ ] `SESSION_SECRET` freshly generated for production, never reused
- [ ] Migrations applied with `migrate deploy` from a trusted machine
- [ ] Pilot clinic's facility and doctors entered through the product
- [ ] Facility coordinates recorded (`npm run clinic:location -- --missing`)
- [ ] CI green on the deployed commit

**Verified as understood, not just configured**
- [ ] Someone other than the author has restored the backup
- [ ] Someone has watched a full session run end to end on the pilot data
- [ ] The clinic has practised the outage fallback at least once
