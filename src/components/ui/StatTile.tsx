import type { ReactNode } from "react";
import { cn } from "./cn";

// One KPI: a large tabular figure with a quiet label above and optional
// context beneath. `tone` only ever *supplements* the number — it never
// carries meaning on its own (DESIGN_SYSTEM.md: nothing relies on colour
// alone), so a tinted value always still reads correctly in monochrome.
export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "success" | "warning";
  icon?: ReactNode;
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
  }[tone];

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className={cn("text-3xl font-bold tabular-nums leading-tight", toneClass)}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
