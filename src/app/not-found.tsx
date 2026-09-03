import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";

// The site-wide 404. There wasn't one, so every miss — a mistyped URL, a
// doctor who has left, a facility whose listing was withdrawn — got Next's
// unstyled default: no header, no navigation, no way onward.
//
// A directory's 404 is a routing decision, not a dead end. Someone who
// reached here was looking for care, so the page offers the three places
// that care can be found rather than an apology.
export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const DESTINATIONS = [
  { href: "/doctors", label: "Find a doctor", hint: "Search verified doctors by name, speciality or location" },
  { href: "/clinics", label: "Find a clinic", hint: "Browse clinics near you and see who practises there" },
  { href: "/hospitals", label: "Find a hospital", hint: "Browse hospitals and their departments" },
];

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">404</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">We couldn&apos;t find that page</h1>
          <p className="text-base text-muted">
            The link may be out of date, or the doctor or facility may no longer be listed on ApnaHealth.
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {DESTINATIONS.map((destination) => (
            <li key={destination.href}>
              <Link
                href={destination.href}
                className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40"
              >
                <span className="font-semibold text-foreground">{destination.label} &rarr;</span>
                <span className="text-sm text-muted">{destination.hint}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted">
          Already have a booking?{" "}
          <Link href="/patient/appointments" className="text-primary underline underline-offset-2">
            Check your appointments
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}
