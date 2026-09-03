# Data Model Contract

## Clinic
id, name, slug, facilityType CLINIC|HOSPITAL, addressLine, areaLabel?, city, state, postalCode?, latitude?, longitude?, phone, timezone, isActive, createdAt, updatedAt

`slug`, `facilityType`, `areaLabel` and the coordinate pair are additions to
the original contract, all on Clinic rather than on new tables:

- `slug` — the public identifier for /facilities/[slug], added when clinics
  and hospitals became discoverable in their own right rather than only as
  the address printed under a doctor's name. Same rule as Doctor.slug:
  internal IDs never go into public URLs. Built from `<name> <city>`,
  because facility names repeat across cities; collisions past that get a
  numeric suffix. Backfilled in SQL by the migration using the same
  slugification `src/lib/slugify.ts` performs, so rows created before and
  after it have consistent URLs. Stable once assigned — renaming a facility
  does not move its public page.
- `facilityType` — a hospital is the same facility record as a clinic at a
  different scale, sharing every relation (doctors, sessions, staff, queue,
  records). A parallel Hospital table would have duplicated all seven of
  them; a discriminator field does not. Defaults to CLINIC, so every row
  predating the field is already correct with no backfill.
- `areaLabel` — locality/neighbourhood, the unit people actually search by
  in Indian cities. `city` alone is too coarse in a metro, and matching on
  the free-text `addressLine` is too specific. Nullable because it is
  genuinely unrecorded for existing rows.
- `latitude?` / `longitude?` — the facility's position, added when radius
  search ("search near you") was built on top of it, and not before. Both
  nullable with no default and no backfill: there is no honest coordinate
  for a facility nobody has geocoded, and 0/0 is a real point in the Gulf
  of Guinea that would rank first for anyone searching from West Africa.
  A facility without them stays fully listed and searchable by name,
  specialty, city and area — it is only absent from radius results.
  Indexed as `(latitude, longitude)` for the bounding-box pre-filter.

Discovery reads Clinic three ways from one row: as the facility behind a
doctor (/doctors), as a clinic (/clinics) and as a hospital (/hospitals).
The split is in the routes, not the schema — `facilityType` is the only
thing that differs, and a facility re-typed from clinic to hospital keeps
its data, its slug and its public page.

Coordinates are on Clinic and are deliberately NOT duplicated onto Doctor.
A Doctor row is already per-facility (`clinicId` is required), so a
doctor's location *is* their facility's; a doctor practising at two
facilities is two Doctor rows, each with its own clinic and therefore its
own position. A second copy on Doctor could only ever drift from the
address it claims to describe.

## Patient location

Not a model. A patient's position is never written to any table: it
arrives as a query parameter, is used to sort one page render, and is
discarded. It is rounded to ~100 m in the browser before it is sent (see
`src/lib/geo/searchParams.ts`), is excluded from logs, and the JSON
endpoint that consumes it is served `Cache-Control: private, no-store`.
Patients who prefer not to share it search by locality, city or PIN code
instead, resolved against the coordinates of already-listed facilities
rather than an external geocoder.

On pages that show one known facility rather than a search — a doctor's
profile, a patient's own appointments — the distance is computed in the
browser against the facility's public coordinates, so nothing about the
patient's position reaches the server at all
(`src/components/discovery/ViewerLocation.tsx`).

## StaffUser
id, clinicId, name, email unique, passwordHash, role OWNER|FRONT_DESK|DOCTOR, doctorId?, isActive, createdAt, updatedAt

## Doctor
id, clinicId, name, slug, specialty, qualificationText, registrationNumber?, registrationCouncil?, experienceYears?, languagesText?, consultationFeeMinor?, bio?, photoUrl?, defaultConsultMinutes, verificationStatus PENDING|VERIFIED|REJECTED, verifiedAt?, verifiedByStaffUserId?, verificationSource?, verificationNotes?, isActive, createdAt, updatedAt

`slug` is the public, human-readable identifier for /doctors/[slug] — not in the original contract, added because "internal IDs never go into public URLs" (below) rules out routing on `id`.

`defaultConsultMinutes` (default 6) is not in the original contract either — added because QUEUE_RULES.md's prediction baseline requires it as its last median-service-time fallback tier.

## DoctorVerification
id, doctorId, checkedByStaffUserId, status PENDING|VERIFIED|REJECTED, registrationNumberChecked, sourceName, sourceReference?, checkedAt, notes?

## Session
id, clinicId, doctorId, publicId, sessionDate, plannedStartAt, plannedEndAt, locationLabel, status SCHEDULED|OPEN|IN_PROGRESS|PAUSED|CLOSED, actualStartAt?, actualEndAt?, createdAt, updatedAt

`publicId` is the public identifier for /book/[sessionId] (linked from the public doctor profile) — same reasoning as Doctor.slug.

## SessionBreak
id, sessionId, startAt, endAt, reason, createdAt, updatedAt

A planned, known-in-advance block of time (e.g. a fixed lunch break) during which the doctor is not consulting. Distinct from Session.status = PAUSED: PAUSED is an unplanned, open-ended interruption (existing pause/resume mechanism, no known end time); a SessionBreak has a known startAt/endAt the prediction engine schedules around in advance. The prediction engine must never predict a consultation start inside a scheduled break, and must recalculate (push later) predictions that would otherwise fall during one.

## Token
id, sessionId, publicId, tokenNumber, patientId?, patientNameSnapshot, patientPhoneSnapshot, source WALK_IN|SELF_BOOK, visitType UNSPECIFIED|NEW|FOLLOW_UP|PROCEDURE, status BOOKED|CHECKED_IN|IN_CONSULT|COMPLETED|NO_SHOW|CANCELLED, queuePriority, issuedAt, checkedInAt?, consultStartedAt?, consultEndedAt?, createdAt, updatedAt

`queuePriority` (default 0) carries service order so that reordering the
queue never has to renumber a token — the number is the patient's identity.
Order is `queuePriority DESC, tokenNumber ASC`; see QUEUE_RULES.md
"Reordering" and `src/lib/queue/ordering.ts`, which owns the single
definition.

`visitType` (default UNSPECIFIED) gives the prediction engine a separate
service-time distribution per kind of visit — see QUEUE_RULES.md
"baseline-v1". Existing rows were NOT backfilled: a visit nobody typed is
unknown, and guessing would mix follow-ups into the NEW distribution.

## Patient
id, name, phone, email?, passwordHash, dateOfBirth?, sex?, createdAt, updatedAt

## ConsultationRecord
id, patientId, doctorId, clinicId, tokenId?, consultedAt, chiefComplaint?, clinicalAssessment?, diagnosisText?, prescriptionText?, followUpInstructions?, createdAt, updatedAt

## RecordConsent
id, patientId, doctorId, clinicId, tokenId?, grantedAt, revokedAt?, scope

## RecordAccessEvent
id, patientId, clinicId, doctorId?, staffUserId?, action VIEW|CREATE|UPDATE, reason?, occurredAt, metadata json

## QueueEvent
Append-only. id, sessionId, tokenId?, actorStaffUserId?, type, occurredAt, metadata json.
Types: TOKEN_ISSUED, CHECKED_IN, CONSULT_STARTED, CONSULT_ENDED, MARKED_NO_SHOW, CANCELLED, SESSION_OPENED, SESSION_PAUSED, SESSION_RESUMED, SESSION_CLOSED, TOKEN_REORDERED.

## PredictionSnapshot
id, tokenId, sessionId, modelVersion, predictedStartAt, windowStartAt, windowEndAt, tokensAhead, medianServiceSeconds, createdAt

## AuditEvent
id, clinicId, actorUserId?, action, entityType, entityId?, occurredAt, metadata json

## PlatformAdmin
ApnaHealth's own review team — NOT a clinic role, and not a fourth StaffRole.
id, name, email (unique), passwordHash, isActive, lastLoginAt?, createdAt, updatedAt

Kept in its own table precisely because of the "every protected query is
scoped by clinicId" rule below: StaffUser.clinicId is required, and a
tenant-less role bolted onto StaffUser would make that rule unenforceable.
A PlatformAdmin has its own session cookie and reaches only /admin, whose
queries are intentionally cross-tenant and are limited to facility approval
and doctor verification. See ACCESS_MATRIX.md.

## AdminEvent
Append-only, the platform-side counterpart to AuditEvent — needed because
AuditEvent is scoped to a clinic and approving a facility is an act *about*
a clinic by someone outside it.
id, adminId, action, entityType, entityId?, occurredAt, metadata json

## PasswordResetToken
id, kind PATIENT|STAFF|ADMIN, accountId, tokenHash (unique), expiresAt, usedAt?, requestedIp?, createdAt

Polymorphic by (kind, accountId) with no foreign key, because it serves all
three account tables. Stores only a SHA-256 hash of the token: the plaintext
exists solely in the emailed link, so this table cannot be replayed.
Single-use and one hour long.

## Clinic — platform approval fields
approvalStatus PENDING|APPROVED|REJECTED, approvalDecidedAt?, approvalNotes?, reviewedByAdminId?

Separate from `isActive`: isActive is the facility's own switch, approval is
ApnaHealth's decision about them. Public listing requires both — the single
definition lives in src/lib/publicListing.ts.

## Doctor / DoctorVerification — reviewer attribution
Doctor gains verifiedByAdminId?; DoctorVerification gains checkedByAdminId?
and relaxes checkedByStaffUserId to optional. Exactly one reviewer column is
set per row, enforced by the single action that writes it. Both columns are
kept so historic clinic-recorded checks stay attributable after verification
moved to the platform review team.

Rules:
- Internal IDs never go into public URLs.
- Every protected query is scoped by clinicId. The one deliberate exception
  is /admin, which exists to look across tenants — and is confined to
  facility approval and doctor verification. It never reads clinical data.
- QueueEvent is never updated/deleted.
- AdminEvent is never updated/deleted.
