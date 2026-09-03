import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Card } from "@/components/ui/Card";

export const metadata = {
  title: "Create an account",
};

interface SignupOption {
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  note?: string;
}

// The header's "Register" button lands here. /get-started used to mix two
// different questions — "who are you?" and "sign in or sign up?" — into one
// four-card grid that sent three of its four cards to the same login page.
// Now signing in is one button (every role, one box) and this page answers
// only the remaining question: what kind of account is being created.
//
// Front desk and other clinic staff are absent on purpose: those accounts
// are created by the facility's owner from inside the app, not self-served,
// because a stranger must not be able to mint themselves a login that can
// see a clinic's queue.
const OPTIONS: SignupOption[] = [
  {
    title: "Patient",
    description: "Find a verified doctor, book a digital token, and watch the live queue so you leave home at the right time.",
    ctaLabel: "Register as a patient",
    href: "/patient/register",
  },
  {
    title: "Doctor",
    description: "List your own practice, publish your schedule, and run your consultations from the doctor dashboard.",
    ctaLabel: "Register as a doctor",
    href: "/register/doctor",
    note: "Reviewed by the ApnaHealth team before your profile goes live.",
  },
  {
    title: "Clinic or hospital",
    description: "Register your facility, add your doctors and front desk, and manage sessions and queues clinic-wide.",
    ctaLabel: "Register a facility",
    href: "/register/clinic",
    note: "Reviewed by the ApnaHealth team before your facility is listed.",
  },
];

export default function RegisterPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Create your ApnaHealth account</h1>
          <p className="mx-auto max-w-md text-base text-muted">Pick the one that describes you. It takes a couple of minutes.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {OPTIONS.map((option) => (
            <Card key={option.title} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-medium text-foreground">{option.title}</h2>
                <p className="text-sm text-muted">{option.description}</p>
              </div>
              <Link
                href={option.href}
                className="mt-auto inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {option.ctaLabel}
              </Link>
              {option.note && <p className="text-xs text-muted">{option.note}</p>}
            </Card>
          ))}
        </div>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-2">
            Sign in
          </Link>
          . Front desk and other clinic staff are added by your facility&apos;s owner from inside ApnaHealth.
        </p>
      </main>
      <Footer />
    </>
  );
}
