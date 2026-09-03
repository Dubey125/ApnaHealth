import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";

// A doctor-shaped 404. Reached both when the slug matches nothing and when
// it matches a doctor who is no longer listed — the page deliberately does
// not distinguish the two, since "this doctor has been deactivated" is not
// ours to announce on their behalf.
export const metadata = {
  title: "Doctor not found",
  robots: { index: false, follow: true },
};

export default function DoctorNotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">This doctor isn&apos;t listed</h1>
          <p className="text-base text-muted">
            They may have moved, or the profile may no longer be published on ApnaHealth. Their clinic could still be.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/doctors"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Search all doctors
          </Link>
          <Link
            href="/clinics"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
          >
            Browse clinics
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
