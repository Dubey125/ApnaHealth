# Data Model Contract

## Clinic
id, name, addressLine, city, state, postalCode?, phone, timezone, isActive, createdAt, updatedAt

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

Rules:
- Internal IDs never go into public URLs.
- Every protected query is scoped by clinicId.
- QueueEvent is never updated/deleted.
