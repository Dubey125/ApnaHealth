# Data Model Contract

## Clinic
id, name, facilityType CLINIC|HOSPITAL, addressLine, areaLabel?, city, state, postalCode?, phone, timezone, isActive, createdAt, updatedAt

`facilityType` and `areaLabel` are additions to the original contract, both
on Clinic rather than on new tables:

- `facilityType` — a hospital is the same facility record as a clinic at a
  different scale, sharing every relation (doctors, sessions, staff, queue,
  records). A parallel Hospital table would have duplicated all seven of
  them; a discriminator field does not. Defaults to CLINIC, so every row
  predating the field is already correct with no backfill.
- `areaLabel` — locality/neighbourhood, the unit people actually search by
  in Indian cities. `city` alone is too coarse in a metro, and matching on
  the free-text `addressLine` is too specific. Nullable because it is
  genuinely unrecorded for existing rows.

Geographic coordinates were deliberately NOT added: a latitude/longitude
pair is only useful with radius search built on top of it, and adding
columns nothing reads yet would be speculative schema.

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
id, sessionId, publicId, tokenNumber, patientId?, patientNameSnapshot, patientPhoneSnapshot, source WALK_IN|SELF_BOOK, status BOOKED|CHECKED_IN|IN_CONSULT|COMPLETED|NO_SHOW|CANCELLED, issuedAt, checkedInAt?, consultStartedAt?, consultEndedAt?, createdAt, updatedAt

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
