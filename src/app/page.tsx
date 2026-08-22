import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";

const BENEFITS = [
  {
    title: "No more guessing",
    body: "See your estimated arrival window on your phone instead of sitting in a waiting room hoping your name gets called.",
  },
  {
    title: "Book in seconds",
    body: "Reserve a digital token for an open session — no phone tag with the front desk, no walking in and hoping there's room.",
  },
  {
    title: "One record, every visit",
    body: "Create a free patient account and your consultation history with each doctor is there the next time you need it.",
  },
];

// The root route was never wired to the product during the phased build —
// every phase built a specific sub-route (/doctors, /login, /app, ...) and
// left this as the untouched create-next-app scaffold, then got a plain
// landing page in an earlier redesign pass. This is the "production UI/UX
// upgrade" pass: a real hero, an actual working search, honest
// verification messaging, patient benefits, a provider CTA, and a footer —
// still linking only to routes that exist, no invented pages.
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-16 px-4 py-12 sm:px-6 sm:py-16">
        <section className="flex flex-col items-start gap-5">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Find the right doctor. Book your visit. Know when to arrive.
          </h1>
          <p className="max-w-xl text-base text-muted sm:text-lg">
            Search verified doctors near you, reserve a digital token in seconds, and track your place in the queue
            in real time — instead of guessing when you&apos;ll be seen.
          </p>

          <form
            method="GET"
            action="/doctors"
            className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row"
          >
            <Input name="name" placeholder="Doctor name" aria-label="Doctor name" className="sm:flex-1" />
            <Input name="specialty" placeholder="Specialty" aria-label="Specialty" className="sm:flex-1" />
            <Input name="city" placeholder="City" aria-label="City" className="sm:flex-1" />
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Search
            </button>
          </form>

          <Link href="/patient/login" className="text-sm text-muted underline underline-offset-2 hover:text-foreground">
            Already have a token? Sign in to track it
          </Link>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium">Every doctor&apos;s registration is checked, never assumed</h2>
            <p className="max-w-md text-sm text-muted">
              Before a doctor carries the verified badge, clinic staff confirm their registration number against an
              official source and record what they checked. Nothing is auto-approved.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start rounded-md bg-background px-3 py-2 sm:self-auto">
            <VerificationStatusBadge status="VERIFIED" />
            <span className="text-xs text-muted">what you&apos;ll see on a checked profile</span>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-medium">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="flex flex-col gap-1">
              <div className="text-sm font-medium text-primary">1. Discover</div>
              <p className="text-sm text-foreground">
                Search doctors by name, specialty or city, and see who&apos;s clinic-verified before you book.
              </p>
            </Card>
            <Card className="flex flex-col gap-1">
              <div className="text-sm font-medium text-primary">2. Book a token</div>
              <p className="text-sm text-foreground">
                Reserve a digital serial for an open session — no phone calls, no waiting-room queue to physically
                hold.
              </p>
            </Card>
            <Card className="flex flex-col gap-1">
              <div className="text-sm font-medium text-primary">3. Track live</div>
              <p className="text-sm text-foreground">
                Your ticket page shows an estimated arrival window that updates as the queue moves — an estimate,
                never a guarantee.
              </p>
            </Card>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-medium">Why patients use ApnaHealth</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex flex-col gap-1">
                <div className="text-sm font-medium text-foreground">{benefit.title}</div>
                <p className="text-sm text-muted">{benefit.body}</p>
              </div>
            ))}
          </div>
        </section>

        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium">Run a clinic or practice?</h2>
            <p className="max-w-sm text-sm text-muted">
              Give your front desk a live queue console, your doctors a point-of-care dashboard, and yourself
              real-time clinic analytics.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Staff sign in
          </Link>
        </Card>
      </main>
      <Footer />
    </>
  );
}
