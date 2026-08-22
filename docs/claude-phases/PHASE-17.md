# Phase 17 — Owner / admin experience
Read CLAUDE.md, docs/product/DESIGN_SYSTEM.md and docs/product/ACCESS_MATRIX.md.
Redesign doctor management + verification (/app/doctors, /app/doctors/[doctorId]), sessions (/app/sessions), and analytics (/app/analytics) using the PHASE-12 primitives — Table for the verification history and token-status breakdown, StatusBadge for verification/session status.
There is currently no UI at all for "staff" (no add-staff flow — StaffUser rows only ever come from prisma/seed.ts) or "audit" (no AuditEvent viewer). Before building either, confirm with the user whether this phase should add them as small, read-mostly new features, or whether the original request's "staff/audit" meant the verification-history and RecordAccessEvent trails that already exist elsewhere. Do not silently invent a new admin feature area.
Do not fabricate or auto-approve doctor verification — the manual-entry requirement on the verification form is unchanged.
Verify at 768px and 1280px/1440px.
