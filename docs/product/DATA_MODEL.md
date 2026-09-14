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
id, patientId, doctorId, clinicId, tokenId?, consultedAt, bloodPressureSystolic?, bloodPressureDiastolic?, pulseBpm?, temperatureF?, spo2Percent?, weightKg?, chiefComplaint?, clinicalAssessment?, diagnosisText?, prescriptionText?, followUpInstructions?, createdAt, updatedAt

Vitals are measurements, not prose. The form always collected them and used
to flatten them into `clinicalAssessment` as
`[Vitals: BP: 130/85 mmHg - Pulse: 78 bpm]`, which captured the numbers and
destroyed them as data — nothing could chart a blood pressure across
visits. Rules live in `src/lib/records/vitals.ts`.

All nullable: clinics do not measure everything at every visit, and an
unrecorded vital is a different fact from zero. Blood pressure is two
columns but one measurement — both or neither, and systolic above
diastolic.

Records written before this change keep their vitals in free text and are
deliberately **not** backfilled: parsing prose into structured medical
measurements means guessing at clinical data, and a wrong guess is a wrong
number in someone's medical record.

Nothing in the product interprets these values. The stored bounds reject
impossible data (a pulse of 1200 is a typo); judging a real reading is the
clinician's decision, per the product safety boundary.

## ConsultationRecordAmendment
Append-only. id, consultationRecordId, doctorId, amendedAt, reason, chiefComplaint?, clinicalAssessment?, diagnosisText?, followUpInstructions?, note?, createdAt

**Never overwrite, always append.** The original `ConsultationRecord` row
is never altered and never deleted; an amendment is a separately attributed
statement alongside it, and both stay readable.

A medical record is evidence of what a clinician believed at the time, on
the information they had. If a later correction could quietly replace the
original, nobody could tell afterwards what was written during the
consultation — the question that matters most when care is reviewed, and
the reason paper records are corrected with a dated, signed line rather
than an eraser. Nothing in the product computes a merged "current" record;
a reader sees the original, marked as amended, then each correction in
order.

Only fields the amender restated are non-null — an amendment that corrected
a diagnosis says nothing about the chief complaint. `reason` is required:
"corrected" is not a reason, and this is the only field that can tell a
future reader why the record changed.

`note` carries what the structured fields cannot. A prescription already
printed and handed to a patient cannot be un-issued, so the honest
correction is a note saying what it should have read.

**Only the record's author may amend it** (`canAmend` in
`src/lib/records/amendments.ts`). A different clinician who disagrees
writes their own record — an amendment carries the authority of whoever
made the original entry.

The foreign key is RESTRICT, not CASCADE: a correction must not be
removable by deleting what it corrects.

## PrescribedMedicine
id, consultationRecordId, position, name, dosage?, timing?, duration?, notes?, createdAt

One medicine on a prescription. The form always built these rows and then
flattened them into `ConsultationRecord.prescriptionText` before saving —
the same mistake vitals made — so nothing could count how often a drug was
prescribed, repeat a prescription at follow-up, or lay one out on a printed
sheet.

Only `name` is required. A prescriber who has written a drug but not yet a
duration must still be able to save it; refusing would push them back into
free text, which is the format this replaces.

`position` is stored because order is part of a prescription — the primary
drug is written first.

`prescriptionText` is **kept, not dropped**: records written before this
have their prescription there, and those are deliberately not parsed into
rows. Splitting a clinician's prescription prose back into drugs and doses
means guessing at a prescription, and a wrong guess is a wrong drug in a
medical record. Such records display and print as written.

Nothing in the product checks a medicine against anything — not the
patient's allergies, not other medicines, not a dose range. Allergies and
medicines are both structured now and sit on the same screen; comparing
them is clinical decision support and needs its own approval rather than
being quietly enabled because the data lines up. See
`src/lib/records/prescription.ts`.

## PatientAllergy
id, patientId, clinicId, doctorId?, substance, reaction?, severity UNKNOWN|MILD|MODERATE|SEVERE, recordedAt, retractedAt?, retractedReason?, retractedByDoctorId?, createdAt, updatedAt

Attached to the **Patient**, not to a visit or a clinic: an allergy is a
fact about the person and does not stop being true in a different building.
`clinicId` and `doctorId` record where and by whom it was captured, for
attribution — **not** to scope who may read it.

**This is a deliberate widening of record access.** Consultation history is
scoped to `doctorId: session.doctorId`; allergies are not. A doctor seeing
a patient for the first time must see an allergy someone else recorded, or
the record creates false confidence instead of safety. The read is
authorised by the treating-clinician gate
(`src/lib/records/loadTokenForDoctorRecord.ts` — a doctor, their own
session, a token that has reached consult) and logged as a
`RecordAccessEvent` like any other. Flag this to the privacy review.

Never hard-deleted. A withdrawn allergy is retracted with a reason and
stays: "recorded and later withdrawn" is clinically meaningful, and
removing it would leave the next clinician unable to tell it had been there.

`Patient.allergiesReviewedAt` / `allergiesReviewedByDoctorId` record that
someone **asked**, independently of what was found. "No known allergies"
and "nobody has asked" look identical in an empty list and are completely
different clinical facts; without this column a blank panel reads as
"cleared". Nothing is backfilled — every existing patient starts as NOT
ASKED, which is the truth.

Nothing in the product compares an allergy to a prescription. No
interaction checking, no contraindication warning, no alerts. That is
clinical decision support and the safety boundary puts it with the
clinician. See `src/lib/records/allergies.ts`.

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

## Subscription
id, clinicId (unique), plan TRIAL|STARTER|GROWTH, status TRIALING|ACTIVE|PAST_DUE|SUSPENDED|CANCELLED, doctorSeats, trialEndsAt?, currentPeriodStartAt?, currentPeriodEndAt?, gracePeriodEndsAt?, providerCustomerId?, providerSubscriptionId?, createdAt, updatedAt

Holds **no card, bank or payment-instrument data**. See
`docs/product/BILLING.md` — in particular the rule that a patient already
holding a token can be seen in every subscription state.

## SubscriptionEvent
Append-only. id, subscriptionId, fromStatus?, toStatus, reason, actorAdminId?, occurredAt, metadata json.

`actorAdminId` is null when the change was made by the clock (a trial
lapsing, a grace period expiring) rather than by a person.
