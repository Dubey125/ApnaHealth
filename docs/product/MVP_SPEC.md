# MVP Specification

## Goal
Prove this workflow in a real clinic:
patient finds a trustworthy doctor -> books a serial -> tracks queue -> arrives in an estimated window -> doctor consults -> clinician records the basic consultation -> authorized history is available at a later visit.

## Roles
- Patient: discovery, profile, booking, ticket, permitted cancellation, own record.
- Front desk: walk-in, check-in, queue operations, no-show, cancellation, session controls.
- Doctor: own sessions, queue, authorized history, consultation record.
- Owner: doctors, staff, sessions, verification, reports, audit.

## Public pages
/, /doctors, /doctors/[slug], /book/[sessionId], /t/[publicId], patient auth/record pages.

## Staff pages
/app, /app/queue/[sessionId], /app/doctors, /app/sessions, /app/doctor, /app/reports, /app/audit.

## Non-goals
No pharmacy, labs, blood, home care, telemedicine/video, payment, insurance, ABDM, AI, native app, public reviews, advertising, emergency triage.
