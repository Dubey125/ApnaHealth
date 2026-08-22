# Phase 14 — Signature queue UI
Read CLAUDE.md, docs/product/DESIGN_SYSTEM.md and docs/product/QUEUE_RULES.md.
Redesign the public ticket page (/t/[publicId]) as the product's signature screen: the patient must understand their token number, queue position, and estimated arrival window within seconds, on a phone, while it's polling for updates.
Make scheduled-break visibility clear on this page (already computed by the prediction engine; today it's plain text with no visual hierarchy).
Do not change the polling mechanism, the prediction algorithm, or QueueEvent semantics — presentation and information hierarchy only.
Verify at 360px/390px/412px (this page is patient-mobile-only) and confirm the live-polling re-render never visibly flashes or jumps.
