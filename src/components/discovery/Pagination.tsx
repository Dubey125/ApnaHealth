import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { buildPageHref, pageLinks, type PageInfo } from "@/lib/discovery/pagination";
import type { RawSearchParams } from "@/lib/discovery/searchParams";

// Page navigation for the discovery lists.
//
// Links, not buttons: each page is a real URL that can be bookmarked,
// shared and crawled, and the whole thing works with JavaScript off. The
// current page is marked aria-current and rendered as plain text rather
// than a link to itself.

export function Pagination({
  basePath,
  params,
  info,
  itemLabel,
}: {
  basePath: string;
  params: RawSearchParams;
  info: PageInfo;
  /** Plural noun for the summary line, e.g. "doctors". */
  itemLabel: string;
}) {
  // Nothing to navigate. The summary is still worth showing when there are
  // results, so the caller renders that separately.
  if (info.totalPages <= 1) return null;

  const links = pageLinks(info.page, info.totalPages);

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className="flex flex-col items-center gap-3 border-t border-border pt-5"
    >
      <p className="text-sm text-muted" role="status">
        Showing <span className="font-medium text-foreground">{info.from}</span>–
        <span className="font-medium text-foreground">{info.to}</span> of{" "}
        <span className="font-medium text-foreground">{info.total}</span> {itemLabel}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {info.hasPrevious ? (
          <Link
            href={buildPageHref(basePath, params, info.page - 1)}
            rel="prev"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            &larr; Previous
          </Link>
        ) : (
          <span className="inline-flex h-10 items-center justify-center rounded-md border border-border/50 px-3 text-sm font-medium text-muted/50">
            &larr; Previous
          </span>
        )}

        {links.map((value, index) =>
          value === null ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-muted">
              …
            </span>
          ) : value === info.page ? (
            <span
              key={value}
              aria-current="page"
              className="inline-flex h-10 min-w-10 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              {value}
            </span>
          ) : (
            <Link
              key={value}
              href={buildPageHref(basePath, params, value)}
              aria-label={`Page ${value}`}
              className={cn(
                "inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors",
                "hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              {value}
            </Link>
          ),
        )}

        {info.hasNext ? (
          <Link
            href={buildPageHref(basePath, params, info.page + 1)}
            rel="next"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Next &rarr;
          </Link>
        ) : (
          <span className="inline-flex h-10 items-center justify-center rounded-md border border-border/50 px-3 text-sm font-medium text-muted/50">
            Next &rarr;
          </span>
        )}
      </div>
    </nav>
  );
}
