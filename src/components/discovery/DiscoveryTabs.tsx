import Link from "next/link";
import { cn } from "@/components/ui/cn";

// What the patient is browsing: doctors, clinics or hospitals.
//
// Three routes rather than one route with a ?type= switch, because these
// are three different things to look for, not three filters on one thing —
// "/hospitals" is a URL a patient can be given, remember and share, and
// each page can say what it is in its own heading.
//
// Deliberately NOT role="tablist"/role="tab", which is what this component
// claimed at first. That ARIA pattern promises a tabpanel in the same
// document that the tab controls and that focus moves into; here each
// "tab" is a link that navigates to a separate page, so the promise is
// false and arrow-key semantics a screen reader would expect do not exist.
// It is a navigation landmark with aria-current, which is what it is.
//
// Filters carry across a switch (specialty, location, radius) so that
// moving from "cardiologists near me" to "hospitals near me" keeps
// everything except the noun.

export type DiscoveryTab = "doctors" | "clinics" | "hospitals";

const TABS: { tab: DiscoveryTab; label: string; href: string }[] = [
  { tab: "doctors", label: "Doctors", href: "/doctors" },
  { tab: "clinics", label: "Clinics", href: "/clinics" },
  { tab: "hospitals", label: "Hospitals", href: "/hospitals" },
];

export interface DiscoveryCounts {
  doctors: number;
  clinics: number;
  hospitals: number;
}

export function DiscoveryTabs({
  active,
  counts,
  carriedParams,
}: {
  active: DiscoveryTab;
  counts: DiscoveryCounts;
  /** Filters worth keeping when switching tab, already narrowed to the shared ones. */
  carriedParams: Record<string, string>;
}) {
  const query = new URLSearchParams(carriedParams).toString();

  return (
    <nav aria-label="Search for" className="flex w-full gap-1 rounded-xl border border-border bg-surface p-1">
      {TABS.map(({ tab, label, href }) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={query.length > 0 ? `${href}?${query}` : href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors sm:gap-2 sm:px-3",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted hover:bg-border/40 hover:text-foreground",
            )}
          >
            {label}
            <span
              className={cn(
                "tabular-nums text-xs",
                isActive ? "text-primary-foreground/70" : "text-muted/70",
              )}
            >
              {counts[tab]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
