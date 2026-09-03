import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      {/* Today, then Upcoming — the two groups that are almost always
          present, so the page settles rather than reflows. */}
      {Array.from({ length: 2 }).map((_, group) => (
        <div key={group} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: group === 0 ? 1 : 2 }).map((_, card) => (
            <Skeleton key={card} className="h-40 w-full" />
          ))}
        </div>
      ))}
      <span className="sr-only" role="status">
        Loading your appointments…
      </span>
    </main>
  );
}
