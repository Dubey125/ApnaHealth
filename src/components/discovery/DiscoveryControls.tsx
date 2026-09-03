import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { buildChipHref, buildHrefWithout, type RawSearchParams } from "@/lib/discovery/searchParams";
import {
  EXPERIENCE_OPTIONS_YEARS,
  FEE_OPTIONS_RUPEES,
  hasAnyDiscoveryFilter,
  type DiscoveryFilters,
} from "@/lib/discovery/filters";
import { DOCTOR_SORTS, FACILITY_SORTS, type DoctorSort, type FacilitySort } from "@/lib/discovery/sorting";

// Sort and refine, as links rather than a form.
//
// Every control here is a plain <Link> that toggles one query parameter, so
// the whole thing works with JavaScript off, each state is a shareable URL,
// and the back button does what it looks like it does. A <select> would
// have needed an onChange handler and a client bundle to achieve less.
//
// Changing any of these resets to page 1 — buildChipHref drops `page`
// whenever another parameter changes.

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
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

interface BaseProps {
  basePath: string;
  params: RawSearchParams;
  hasLocation: boolean;
}

export function DiscoveryControls({
  basePath,
  params,
  filters,
  sort,
  hasLocation,
}: BaseProps & { filters: DiscoveryFilters; sort: DoctorSort }) {
  const anyRefinement = hasAnyDiscoveryFilter(filters);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Sort by</h2>
        <div className="flex flex-wrap gap-2">
          {DOCTOR_SORTS.filter((option) => !option.needsLocation || hasLocation).map((option) => {
            // "Best match" and "Nearest first" are the same thing once a
            // location is active (see parseDoctorSort), so only one of the
            // two is ever offered — showing both would give two controls
            // that do the same thing.
            if (hasLocation && option.value === "match") return null;
            return (
              <Chip
                key={option.value}
                active={sort === option.value}
                href={buildChipHref(basePath, params, "sort", option.value)}
              >
                {option.label}
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Refine</h2>
          {anyRefinement && (
            <Link
              href={buildHrefWithout(basePath, params, ["today", "maxFee", "minExp", "page"])}
              className="text-sm text-primary underline underline-offset-2"
            >
              Clear refinements
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip
            active={filters.availableToday}
            href={buildChipHref(basePath, params, "today", filters.availableToday ? null : "1")}
          >
            Available today
          </Chip>

          {FEE_OPTIONS_RUPEES.map((fee) => (
            <Chip
              key={`fee-${fee}`}
              active={filters.maxFeeRupees === fee}
              href={buildChipHref(basePath, params, "maxFee", filters.maxFeeRupees === fee ? null : String(fee))}
            >
              Under ₹{fee}
            </Chip>
          ))}

          {EXPERIENCE_OPTIONS_YEARS.map((years) => (
            <Chip
              key={`exp-${years}`}
              active={filters.minExperienceYears === years}
              href={buildChipHref(
                basePath,
                params,
                "minExp",
                filters.minExperienceYears === years ? null : String(years),
              )}
            >
              {years}+ years
            </Chip>
          ))}
        </div>

        {/* Both columns are nullable, and a comparison never matches NULL,
            so these filters exclude doctors who simply haven't recorded the
            figure. Said out loud rather than left to be discovered. */}
        {(filters.maxFeeRupees !== null || filters.minExperienceYears !== null) && (
          <p className="text-xs text-muted">
            Doctors who haven&apos;t published a{" "}
            {filters.maxFeeRupees !== null && filters.minExperienceYears !== null
              ? "fee or their years of experience"
              : filters.maxFeeRupees !== null
                ? "consultation fee"
                : "number of years in practice"}{" "}
            aren&apos;t shown while this filter is on.
          </p>
        )}
      </div>
    </div>
  );
}

export function FacilityDiscoveryControls({
  basePath,
  params,
  filters,
  sort,
  hasLocation,
}: BaseProps & { filters: DiscoveryFilters; sort: FacilitySort }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Sort by</h2>
        <div className="flex flex-wrap gap-2">
          {FACILITY_SORTS.filter((option) => !option.needsLocation || hasLocation).map((option) => {
            if (hasLocation && option.value === "match") return null;
            return (
              <Chip
                key={option.value}
                active={sort === option.value}
                href={buildChipHref(basePath, params, "sort", option.value)}
              >
                {option.label}
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Refine</h2>
        <div className="flex flex-wrap gap-2">
          <Chip
            active={filters.availableToday}
            href={buildChipHref(basePath, params, "today", filters.availableToday ? null : "1")}
          >
            Open today
          </Chip>
        </div>
      </div>
    </div>
  );
}
