import { Skeleton } from "@/components/ui/Skeleton";

// The loading shape of a discovery page.
//
// Every one of these routes runs several sequential queries against Neon,
// whose serverless compute is documented in lib/db.ts as ranging from
// instant to several seconds when cold. Without a loading.tsx that is a
// blank white screen for the whole of it.
//
// The skeleton mirrors the real layout — heading, tabs, location panel,
// search form, chips, a grid of cards — so the page does not jump when the
// content arrives.

export function DiscoverySkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6" aria-busy="true">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>

        {/* Tabs */}
        <div className="flex w-full gap-1 rounded-xl border border-border bg-surface p-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 flex-1" />
          ))}
        </div>

        {/* "Search near you" panel */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Skeleton className="h-11 w-full sm:w-44" />
            <Skeleton className="h-11 flex-1" />
          </div>
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>

        {/* Filter form */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-full sm:w-44" />
          <Skeleton className="h-11 w-full sm:w-24" />
        </div>
      </div>

      {/* Browse-by chips */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28" />
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-36" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: cards }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading results…
      </span>
    </main>
  );
}
