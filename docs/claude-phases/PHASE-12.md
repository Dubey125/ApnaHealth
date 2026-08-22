# Phase 12 — Design system foundations
Read CLAUDE.md and docs/product/DESIGN_SYSTEM.md.
Implement the color/typography/spacing tokens in globals.css, and the component primitives (Button, Input, Textarea, Select, FormError, Card, Badge, Alert, Skeleton, EmptyState, Toast, Dialog, Table, PageHeader) in src/components/ui/.
Build a minimal AppShell with role-aware navigation for /app/* — the current codebase has no persistent nav anywhere under /app; each role sees only the links ACCESS_MATRIX.md grants it.
Add loading.tsx skeleton states for at least the queue, doctor dashboard, and analytics routes, to prove the Skeleton component works in a real route.
Do not redesign individual page content yet beyond wiring the new AppShell/PageHeader — that's PHASE-13 onward.
Do not add a component library dependency; see DESIGN_SYSTEM.md's "No new runtime dependencies."
Verify at 360px, 768px and 1280px widths, and with keyboard-only navigation.
