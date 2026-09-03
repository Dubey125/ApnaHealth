import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { buildChipHref, type RawSearchParams } from "@/lib/discovery/searchParams";

// Browse-by chips (speciality, city, facility type), shared by every
// discovery route so they toggle and preserve query state identically.

export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

// A large hospital can list dozens of departments; an unbounded row of them
// pushes the results themselves off the first screen. The overflow is
// disclosed rather than dropped — <details> needs no JavaScript and stays
// keyboard-operable.
const VISIBLE_CHIPS = 10;

export function FilterChipGroup({
  heading,
  basePath,
  params,
  paramKey,
  options,
  activeValue,
}: {
  heading: string;
  basePath: string;
  params: RawSearchParams;
  paramKey: string;
  options: ChipOption[];
  activeValue?: string;
}) {
  if (options.length === 0) return null;

  const isActive = (value: string) => activeValue?.toLowerCase() === value.toLowerCase();
  // An active chip that falls beyond the cut would otherwise be hidden
  // inside a collapsed disclosure while the page claims to be filtered by
  // it, so it is always promoted into the visible set.
  const ordered = [...options].sort((a, b) => Number(isActive(b.value)) - Number(isActive(a.value)));
  const visible = ordered.slice(0, VISIBLE_CHIPS);
  const overflow = ordered.slice(VISIBLE_CHIPS);

  const chip = (option: ChipOption) => (
    <FilterChip
      key={option.value}
      active={isActive(option.value)}
      href={buildChipHref(basePath, params, paramKey, isActive(option.value) ? null : option.value)}
    >
      {option.label}
      {option.count !== undefined && (
        <span className={cn("tabular-nums", isActive(option.value) ? "text-primary-foreground/70" : "text-muted/70")}>
          {option.count}
        </span>
      )}
    </FilterChip>
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{heading}</h2>
      <div className="flex flex-wrap gap-2">
        {visible.map(chip)}
        {overflow.length > 0 && (
          <details className="group/more">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-full border border-dashed border-border px-3.5 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              +{overflow.length} more
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">{overflow.map(chip)}</div>
          </details>
        )}
      </div>
    </div>
  );
}
