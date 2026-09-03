import Link from "next/link";
import { buildChipHref, buildHrefWithout, LOCATION_PARAMS, type RawSearchParams } from "@/lib/discovery/searchParams";
import { MAX_RADIUS_KM, RADIUS_OPTIONS_KM } from "@/lib/geo/searchParams";

// The empty state for discovery, with the way out attached.
//
// This used to read "Try a wider radius, or clear the location to see
// everyone listed." — which tells someone what to do and then makes them
// do it themselves, by finding the radius control and changing it. Every
// suggestion here is a link that performs the suggestion.

export interface NoResultsProps {
  basePath: string;
  params: RawSearchParams;
  /** "doctors", "clinics", "hospitals" — what the page was looking for. */
  plural: string;
  hasLocation: boolean;
  hasFilters: boolean;
  radiusKm: number;
}

function ActionLink({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          : "inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      }
    >
      {children}
    </Link>
  );
}

export function NoResults({ basePath, params, plural, hasLocation, hasFilters, radiusKm }: NoResultsProps) {
  // The next radius up the menu. At the top of the menu there is nothing
  // wider to offer, so the widen action is simply not shown rather than
  // rendered as a link that changes nothing.
  const widerRadius = RADIUS_OPTIONS_KM.find((option) => option > radiusKm) ?? (radiusKm < MAX_RADIUS_KM ? MAX_RADIUS_KM : null);

  const title = hasLocation ? `No ${plural} within ${radiusKm} km` : `No ${plural} match those filters`;

  const description = hasLocation
    ? `Nothing is listed close enough yet. ApnaHealth is new in some areas — widening the search usually helps.`
    : hasFilters
      ? "Nothing matched. Try a broader search, or browse everything listed."
      : `No ${plural} are listed yet.`;

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted">{description}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasLocation && widerRadius !== null && (
          <ActionLink primary href={buildChipHref(basePath, params, "radiusKm", String(widerRadius))}>
            Search {widerRadius} km instead
          </ActionLink>
        )}
        {hasLocation && (
          <ActionLink href={buildHrefWithout(basePath, params, [...LOCATION_PARAMS])}>
            Show everyone listed
          </ActionLink>
        )}
        {!hasLocation && hasFilters && <ActionLink href={basePath}>Clear filters</ActionLink>}

        {/* Whatever they were looking for isn't here — the other two tabs
            might have it, and a dead end that offers no onward route is
            how someone leaves. */}
        {basePath !== "/doctors" && <ActionLink href="/doctors">Browse doctors</ActionLink>}
        {basePath !== "/clinics" && <ActionLink href="/clinics">Browse clinics</ActionLink>}
        {basePath !== "/hospitals" && <ActionLink href="/hospitals">Browse hospitals</ActionLink>}
      </div>
    </div>
  );
}
