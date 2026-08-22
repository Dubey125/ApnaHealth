// Minimal class-list joiner — no clsx/tailwind-merge dependency
// (DESIGN_SYSTEM.md: no new runtime dependencies for this).
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
