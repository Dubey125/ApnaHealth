import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Card } from "@/components/ui/Card";

// The root route was never wired to the product during the phased build —
// every phase built a specific sub-route (/doctors, /login, /app, ...) and
// left this as the untouched create-next-app scaffold. This is a plain
// landing page pointing at what's actually built, not marketing copy for
// features that don't exist yet (MVP_SPEC.md's non-goals list is long).
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-14 px-4 py-12 sm:px-6 sm:py-16">
        <section className="flex flex-col items-start gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">ApnaHealth</h1>
          <p className="max-w-xl text-base text-muted sm:text-lg">
            Find a verified doctor, book a digital token, and track your place in the queue in real time — instead
            of guessing when you&apos;ll be seen.
          </p>
          <div className="mt-2 flex w-full flex-wrap gap-3 sm:w-auto">
            <Link
              href="/doctors"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Find a doctor
            </Link>
            <Link
              href="/patient/login"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-surface px-5 text-base font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Patient login
            </Link>
          </div>
        </section>

        <section className="grid gap-6 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-muted">1. Discover</div>
            <p className="text-sm text-foreground">
              Search doctors by name, specialty or city, and see who&apos;s clinic-verified before you book.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-muted">2. Book a token</div>
            <p className="text-sm text-foreground">
              Reserve a digital serial for an open session — no phone calls, no waiting-room queue to physically
              hold.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-muted">3. Track live</div>
            <p className="text-sm text-foreground">
              Your ticket page shows an estimated arrival window that updates as the queue moves — an estimate,
              never a guarantee.
            </p>
          </div>
        </section>

        <Card className="text-sm text-muted">
          Run a clinic?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-2">
            Staff sign in
          </Link>{" "}
          for the doctor dashboard, front-desk queue console, and clinic analytics.
        </Card>
      </main>
    </>
  );
}
