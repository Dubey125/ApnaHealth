import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Card } from "@/components/ui/Card";

interface RoleOption {
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
}

// There is one shared staff login (/login) for Owner, Doctor, and Front
// Desk — no separate URL per role. Doctor / Clinic Owner / Front Desk all
// route there honestly; the card copy is what differentiates them, not a
// fake distinct backend. Patient is the one role with its own real login.
const ROLES: RoleOption[] = [
  {
    title: "Patient",
    description: "Find a doctor, book a digital token, and track your place in the queue.",
    ctaLabel: "Continue as patient",
    href: "/patient/login",
  },
  {
    title: "Doctor",
    description: "See today's schedule, your live queue, and open each patient's consultation workspace.",
    ctaLabel: "Continue as doctor",
    href: "/login",
  },
  {
    title: "Clinic Owner",
    description: "Manage doctors, schedule sessions, and view clinic-wide analytics.",
    ctaLabel: "Continue as clinic owner",
    href: "/login",
  },
  {
    title: "Front Desk",
    description: "Issue walk-in tokens, check patients in, and run the live queue console.",
    ctaLabel: "Continue as front desk",
    href: "/login",
  },
];

export default function GetStartedPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Get started with ApnaHealth</h1>
          <p className="mx-auto max-w-md text-base text-muted">Choose how you use ApnaHealth — we&apos;ll take you to the right place.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {ROLES.map((role) => (
            <Card key={role.title} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-medium text-foreground">{role.title}</h2>
                <p className="text-sm text-muted">{role.description}</p>
              </div>
              <Link
                href={role.href}
                className="mt-auto inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {role.ctaLabel}
              </Link>
            </Card>
          ))}
        </div>

        <p className="text-center text-sm text-muted">
          Don&apos;t have an account yet?{" "}
          <Link href="/patient/register" className="font-medium text-primary underline underline-offset-2">
            Register as a patient
          </Link>
          ,{" "}
          <Link href="/register/doctor" className="font-medium text-primary underline underline-offset-2">
            register as a doctor
          </Link>
          ,{" "}
          <Link href="/register/clinic" className="font-medium text-primary underline underline-offset-2">
            register a clinic or hospital
          </Link>
          , or{" "}
          <Link href="/#for-clinics" className="font-medium text-primary underline underline-offset-2">
            learn about running your clinic on ApnaHealth
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}
