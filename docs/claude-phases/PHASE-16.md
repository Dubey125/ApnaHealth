# Phase 16 — Front desk console
Read CLAUDE.md and docs/product/DESIGN_SYSTEM.md.
Redesign /app/queue/[sessionId] as a single-screen operational console: an extremely large current-token display, a clear "Done — Call Next" primary action, no-show/cancel controls behind a confirmation dialog (currently instant, no confirm step), walk-in issuance, and scheduled-break visibility — all reachable without scrolling at 1280px+.
Add a keyboard shortcut for the single most-used action (Done — Call Next) if it can be done unobtrusively and documented on-screen; do not remove mouse/touch operability.
Do not change token-status transitions, the advisory-lock transaction, or the on-break guard in actions.ts.
Verify at 768px (a front-desk device could be a tablet) and 1280px/1440px.
