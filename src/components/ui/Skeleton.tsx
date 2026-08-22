import { cn } from "./cn";

// Tailwind's built-in animate-pulse — a gentle opacity pulse, not a
// shimmer/gradient sweep (DESIGN_SYSTEM.md: avoid flashy animation).
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-border/60", className)} />;
}
