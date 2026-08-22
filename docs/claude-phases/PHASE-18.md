# Phase 18 — Accessibility, responsiveness and final QA
Read CLAUDE.md and docs/product/DESIGN_SYSTEM.md.
Sweep every route touched in PHASE-12–17 (plus error.tsx/global-error.tsx/the root layout) for: semantic HTML, keyboard navigation and visible focus states, accessible labels on every form control, color contrast, and touch-target size.
Verify every major screen at 360px, 390px, 412px, 768px, 1280px and 1440px; record actual per-screen results, not a blanket "looks fine."
Check performance: confirm no heavy client-side dependency crept in across phases 12–17 (diff package.json), and that /doctors and /t/[publicId] — public, high-traffic-by-design — stayed lightweight.
Run the full build/lint/test suite and report final numbers.
Report any remaining visual issues honestly rather than declaring the redesign complete if something is left rough.
