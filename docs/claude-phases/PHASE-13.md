# Phase 13 — Patient experience
Read CLAUDE.md and docs/product/DESIGN_SYSTEM.md.
Redesign the marketing homepage, doctor search (/doctors), doctor profile (/doctors/[slug]), booking flow (/book/[sessionId]), and patient auth/account (/patient/login, /patient/register, /patient/account, /patient/records) using the PHASE-12 primitives.
Add empty/loading/error states to each: no search results, no upcoming sessions, no consultation records yet.
Preserve all booking/auth business logic, validation, and rate-limit behavior exactly — this phase is presentation only.
Mobile-first: verify at 360px, 390px, 412px before checking 768px/1280px.
