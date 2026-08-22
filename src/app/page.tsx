import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { VerificationStatusBadge, TokenStatusBadge, SessionStatusBadge } from "@/components/ui/StatusBadge";
import { AudienceCard } from "@/components/marketing/AudienceCard";
import { PreviewFrame } from "@/components/marketing/PreviewFrame";

const TRUST_ITEMS = ["Verified doctor profiles", "Digital serials", "Live queue intelligence", "Secure care history"];

const HOW_IT_WORKS = [
  { step: "Need", body: "You need to see a doctor." },
  { step: "Discover", body: "Search by name, specialty, or city and see who's clinic-verified." },
  { step: "Book", body: "Reserve a digital token for an open session in seconds." },
  { step: "Queue", body: "Track your position and estimated arrival window in real time." },
  { step: "Consult", body: "Your doctor sees your authorized history at the point of care." },
  { step: "Continue care", body: "Your consultation record stays with your account for next time." },
];

const CARE_TIMELINE = [
  { date: "12 Jun 2026", doctor: "Dr. Aditi Sharma", note: "Follow-up: blood pressure stable, continue current medication." },
  { date: "3 Mar 2026", doctor: "Dr. Aditi Sharma", note: "Diagnosis recorded, prescription issued, follow-up in 3 months." },
  { date: "18 Nov 2025", doctor: "Dr. Rohan Mehta", note: "Initial consultation, chief complaint and assessment recorded." },
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-primary" aria-hidden="true">
      <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex w-full flex-1 flex-col">
        {/* 1. HERO */}
        <section className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 sm:py-20">
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
              Healthcare, connected from discovery to consultation.
            </h1>
            <p className="max-w-xl text-base text-muted sm:text-lg">
              Find the right doctor, book your digital serial, know when to arrive, and keep your authorized care
              history with you.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/doctors"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Find a Doctor
              </Link>
              <Link
                href="/#for-clinics"
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-5 text-base font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                For Clinics
              </Link>
            </div>

            <form
              method="GET"
              action="/doctors"
              className="mt-2 flex w-full max-w-2xl flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row"
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
          </div>
        </section>

        {/* 2. TRUST STRIP */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-4 px-4 py-8 sm:px-6 lg:grid-cols-4">
            {TRUST_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckIcon />
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* 3. FOUR AUDIENCE SECTION */}
        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Built for everyone in the room</h2>
            <p className="max-w-xl text-sm text-muted">
              One coordinated system for the four people who make a clinic visit actually work.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AudienceCard
              id="for-patients"
              title="Patients"
              bullets={["Find doctors", "Book appointments", "Track queue", "View care history"]}
              ctaLabel="Find a Doctor"
              ctaHref="/doctors"
            />
            <AudienceCard
              id="for-doctors"
              title="Doctors"
              bullets={["Today's schedule", "Live queue", "Patient history", "Consultation workspace"]}
              ctaLabel="Doctor Login"
              ctaHref="/login"
            />
            <AudienceCard
              id="for-clinics"
              title="Clinics"
              bullets={["Doctor management", "Session scheduling", "Queue management", "Analytics"]}
              ctaLabel="Clinic Login"
              ctaHref="/login"
            />
            <AudienceCard
              id="for-front-desk"
              title="Front Desk"
              bullets={["Issue tokens", "Check-in", "Call next", "No-show / cancellation"]}
              ctaLabel="Staff Login"
              ctaHref="/login"
            />
          </div>
        </section>

        {/* 4. PRODUCT PREVIEW SECTION */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">One system, four screens</h2>
              <p className="max-w-xl text-sm text-muted">
                The same queue, the same clinic, seen the way each person needs to see it.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PreviewFrame label="Doctor dashboard">
                <span className="text-xs text-muted">Current patient</span>
                <div className="text-3xl font-bold tabular-nums leading-none text-foreground">#12</div>
                <SessionStatusBadge status="IN_PROGRESS" />
                <div className="mt-2 h-9 rounded-md bg-primary/90 text-center text-xs font-medium leading-9 text-primary-foreground">
                  Done — call next
                </div>
              </PreviewFrame>

              <PreviewFrame label="Clinic management">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">Dr. Aditi Sharma</span>
                  <VerificationStatusBadge status="VERIFIED" />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">Dr. Rohan Mehta</span>
                  <VerificationStatusBadge status="PENDING" />
                </div>
                <div className="mt-2 border-t border-border pt-2 text-xs text-muted">3 sessions scheduled today</div>
              </PreviewFrame>

              <PreviewFrame label="Front-desk console">
                <span className="text-xs text-muted">Waiting (5)</span>
                <div className="flex items-center justify-between rounded-md bg-background px-2 py-1.5 text-xs">
                  <span className="text-foreground">#13 · Checked in</span>
                  <Badge variant="info">Check in</Badge>
                </div>
                <div className="flex items-center justify-between rounded-md bg-background px-2 py-1.5 text-xs">
                  <span className="text-foreground">#14 · Booked</span>
                  <Badge variant="neutral">Waiting</Badge>
                </div>
              </PreviewFrame>

              <PreviewFrame label="Patient live queue">
                <span className="text-xs text-muted">Your token</span>
                <div className="text-3xl font-bold tabular-nums leading-none text-foreground">#28</div>
                <TokenStatusBadge status="CHECKED_IN" />
                <div className="mt-2 border-t border-border pt-2 text-xs text-muted">Arrive 2:35 – 2:55 PM</div>
              </PreviewFrame>
            </div>
          </div>
        </section>

        {/* 5. SIGNATURE LIVE QUEUE SECTION */}
        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <h2 className="text-2xl font-semibold tracking-tight">Always know exactly where you stand</h2>
            <p className="max-w-xl text-sm text-muted">
              The moment you book, your phone becomes your place in line — updating on its own as the queue moves.
            </p>
          </div>

          <Card className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 p-8 text-center">
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm text-muted">Your token</span>
              <div className="text-6xl font-bold tabular-nums leading-none text-foreground">#28</div>
              <TokenStatusBadge status="CHECKED_IN" />
            </div>

            <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-center gap-1.5 text-sm text-muted">
                <span>Now serving</span>
                <span className="font-semibold tabular-nums text-foreground">#24</span>
              </div>
              <div>
                <div className="text-3xl font-bold tabular-nums text-foreground">3</div>
                <div className="text-sm text-muted">patients ahead</div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-xs text-muted">Estimated arrival</div>
                <div className="text-lg font-medium tabular-nums text-foreground">2:35 PM – 2:55 PM</div>
                <div className="mt-1 text-xs text-muted">Leave around 2:25 PM</div>
              </div>
            </div>

            <div className="w-full rounded-md border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning">
              Doctor on scheduled lunch break, 1:00 – 1:30 PM — already reflected above
            </div>
          </Card>
          <p className="text-center text-xs text-muted">Illustrative example — every estimate is a window, never a guarantee.</p>
        </section>

        {/* 6. VERIFIED DOCTOR SECTION */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex max-w-xl flex-col gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">What &quot;verified&quot; actually means</h2>
              <p className="text-sm text-muted">
                Clinic staff manually check each doctor&apos;s registration number against an official source before
                a profile carries the verified badge. Verification is never automatic, and it&apos;s never assumed —
                a doctor without the badge simply hasn&apos;t been checked yet, not flagged as untrustworthy.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-background px-6 py-5">
              <VerificationStatusBadge status="VERIFIED" />
              <span className="text-xs text-muted">what a checked profile shows</span>
            </div>
          </div>
        </section>

        {/* 7. PATIENT CARE HISTORY SECTION */}
        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Your care history, kept with you</h2>
            <p className="max-w-xl text-sm text-muted">
              Every consultation your doctor records stays attached to your account — not the clinic that happened
              to see you that day.
            </p>
          </div>
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            {CARE_TIMELINE.map((entry) => (
              <Card key={entry.date} className="flex gap-4">
                <div className="flex w-2 shrink-0 justify-center">
                  <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted">
                    {entry.date} · {entry.doctor}
                  </span>
                  <span className="text-sm text-foreground">{entry.note}</span>
                </div>
              </Card>
            ))}
          </div>
          <p className="text-center text-xs text-muted">Illustrative example timeline — not real patient data.</p>
        </section>

        {/* 8. HOW IT WORKS */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {HOW_IT_WORKS.map((item, i) => (
                <div key={item.step} className="flex flex-col gap-1">
                  <div className="text-xs font-medium text-primary">
                    {i + 1}. {item.step}
                  </div>
                  <p className="text-sm text-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 9. CLINIC CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <Card className="flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex max-w-lg flex-col gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">Run a clinic with less queue friction.</h2>
              <ul className="flex flex-col gap-1.5 text-sm text-muted">
                <li className="flex items-center gap-2">
                  <CheckIcon />
                  Doctor management &amp; verification
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon />
                  Session scheduling
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon />
                  Front-desk queue console
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon />
                  Clinic-wide analytics
                </li>
              </ul>
            </div>
            <Link
              href="/login"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Manage your clinic
            </Link>
          </Card>
        </section>
      </main>
      <Footer />
    </>
  );
}
