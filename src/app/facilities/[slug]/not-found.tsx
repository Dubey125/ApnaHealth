import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";

// Reached when a facility slug matches nothing, and also when it matches a
// facility that is not (or no longer) listed — one awaiting review, one
// that was rejected, or one that has switched itself off. Same page for all
// of them on purpose: which of those is true is the facility's business,
// not something a public 404 should disclose.
export const metadata = {
  title: "Facility not found",
  robots: { index: false, follow: true },
};

export default function FacilityNotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">This facility isn&apos;t listed</h1>
          <p className="text-base text-muted">
            It may not have completed review yet, or it may no longer be published on ApnaHealth.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/clinics"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse clinics
          </Link>
          <Link
            href="/hospitals"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            Browse hospitals
          </Link>
          <Link
            href="/doctors"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            Find a doctor
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
