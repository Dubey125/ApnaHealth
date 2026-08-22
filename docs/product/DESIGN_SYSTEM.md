# Design System

Locked contract for the UI/UX phases (PHASE-12 onward), the same way
DATA_MODEL.md is locked for the data phases. Read this before any UI phase.
Deviations get flagged in that phase's report, same convention as the
backend phases.

## Direction

Modern Indian healthcare SaaS: trustworthy, calm, professional, clean.
Mobile-first for patients; desktop/tablet-optimized for doctors and staff.
No gradients as decoration, no page-transition animation, no shimmer/glow
effects, no generic "AI dashboard" look (no glassmorphism, no neon accent
colors, no illustration-heavy empty states). Motion is limited to short
(150–200ms) opacity/transform transitions on hover, focus, and state
changes — nothing plays automatically.

## Color tokens

Defined as CSS custom properties in `globals.css` under `@theme inline`
(extending the existing `--background`/`--foreground` pair, same mechanism
already in use — not a new system). Light values on `:root`, dark values
under the existing `prefers-color-scheme: dark` block.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-primary` | `#0f766e` (teal-700) | `#2dd4bf` (teal-400) | Primary actions, links, focus ring accent |
| `--color-primary-foreground` | `#ffffff` | `#052e2b` | Text/icons on primary-filled surfaces |
| `--background` | `#ffffff` | `#0a0a0a` | existing |
| `--foreground` | `#171717` | `#ededed` | existing |
| `--color-surface` | `#f8fafc` (slate-50) | `#111827` (gray-900) | Card/section backgrounds one step off the page background |
| `--color-border` | `#e2e8f0` (slate-200) | `#27272a` (zinc-800) | All borders — replaces ad-hoc `border` (currentColor) |
| `--color-muted` | `#64748b` (slate-500) | `#a1a1aa` (zinc-400) | Secondary text — replaces the mixed `text-gray-500/600/700` currently scattered across 14 files |
| `--color-success` | `#15803d` (green-700) | `#4ade80` (green-400) | VERIFIED, COMPLETED, "on time" |
| `--color-warning` | `#b45309` (amber-700) | `#fbbf24` (amber-400) | PENDING, scheduled breaks, PAUSED |
| `--color-danger` | `#b91c1c` (red-700) | `#f87171` (red-400) | Errors, CANCELLED, NO_SHOW, destructive actions |
| `--color-info` | `#1d4ed8` (blue-700) | `#60a5fa` (blue-400) | Prediction windows, informational banners |

Teal as primary (not the current plain black) because it's the calm/trust
color most associated with healthcare without tipping into a "generic SaaS
purple/indigo" look the direction explicitly warns against. Buttons keep
high contrast text; nothing relies on color alone (every status also has a
text label, for colorblind users and for the plain-text no-CSS case).

## Typography

Keep the existing Geist Sans/Mono font loading in `layout.tsx` — no new
font dependency. Formalize the scale (current code uses ad-hoc `text-xl`,
`text-3xl`, `text-sm` with no naming):

| Role | Class | Used for |
|---|---|---|
| Display | `text-3xl sm:text-4xl font-semibold tracking-tight` | Marketing homepage hero only |
| H1 | `text-2xl font-semibold tracking-tight` | Page titles |
| H2 | `text-lg font-medium` | Section headings within a page |
| Body | `text-sm sm:text-base` | Default paragraph/label text |
| Small | `text-xs` | Timestamps, captions, badge text |
| Numeric display | `text-4xl sm:text-6xl font-bold tabular-nums` | The current-token number on the front-desk console and doctor dashboard — this is the one place large numerals are load-bearing (front desk needs it readable from across a room) |

## Spacing

Tailwind's default scale, used consistently rather than the current mix:
- Page padding: `p-4 sm:p-6`
- Section gap: `gap-6` (or `gap-8` between major page sections)
- Card padding: `p-4`
- Form field gap: `gap-3`
- Inline gap (badge next to text, icon next to label): `gap-1.5` or `gap-2`

## Component inventory

All in `src/components/ui/` (new directory). Server-renderable where
possible — only interactive primitives (`Toast`, `Dialog`) need `"use
client"`. Each is a thin Tailwind wrapper, not a new runtime dependency
(see "No new dependencies" below).

- **Button** — `variant`: primary / secondary / danger / ghost. `size`: sm / md / lg. Replaces the ~12 hand-typed `rounded bg-black px-3 py-2 text-white` instances.
- **Input / Textarea / Select** — consistent border, focus ring, error state, label + helper text slot.
- **FormError** — the `{state.error && <p className="text-sm text-red-600">{state.error}</p>}` pattern, currently duplicated verbatim across ~14 client components.
- **Card** — surface + border + padding wrapper, replaces ad-hoc `rounded border p-3/p-4/p-6`.
- **Badge** — status pill. Generalizes `VerifiedBadge` into a `StatusBadge` that maps `TokenStatus` / `SessionStatus` / `VerificationStatus` to a color + label, so status color logic lives in one typed place instead of being re-decided per page.
- **Alert** — banner variant of FormError, for page-level (not just field-level) messages — e.g. "This session isn't open for consultations."
- **Skeleton** — loading placeholder. Paired with real `loading.tsx` files (currently zero exist anywhere in the app).
- **EmptyState** — icon/text/optional action, replaces bare `<p className="text-sm text-gray-600">No X yet.</p>` currently repeated ~10 times with no visual treatment.
- **Toast** — new capability (nothing like it exists today). For confirmation of actions that currently only show feedback via full-page revalidation (e.g. "Break added", "Token checked in").
- **Dialog** — new capability. For destructive confirmations (cancel/no-show currently fire immediately with no confirmation step).
- **Table** — for analytics' token-status breakdown and the doctor verification history list, currently plain `<ul>`s.
- **PageHeader** — title + optional back link + optional action slot, replaces the hand-rolled `<div className="flex items-center justify-between">` header at the top of nearly every page.
- **AppShell / role nav** — there is currently **no persistent navigation** anywhere in the app: every `/app/*` page is a bare `<main>` with no header, no back link beyond a few one-off `<Link>`s, and no way to get from e.g. the queue page to analytics without knowing the URL or going back through `/app`. This is the single biggest structural gap the audit found and is PHASE-12's main non-token deliverable.

## No new runtime dependencies

Everything above is buildable with Tailwind + plain React + the native
`<dialog>` element (for Dialog) — no headless-UI/Radix/shadcn package
needed for this app's actual complexity, and CLAUDE.md requires approval
before adding one anyway. Toast can be a small self-contained
context+portal (~60 lines), no library. Flag in the phase report if any
phase turns out to genuinely need one instead of proceeding silently.

## What does not change

- No Tailwind version change, no CSS-in-JS, no component library install.
- No change to any Server Action, Prisma query, or authorization check —
  UI phases touch presentation only. If a UI phase finds a real bug in
  business logic while doing this work, it gets reported and fixed as a
  clearly-flagged, separate, minimal change — not folded silently into a
  "styling" commit.
- No change to `prisma/schema.prisma` unless a UI phase finds it's
  genuinely impossible without one (expected: none of them should).
