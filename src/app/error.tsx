"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

// Catches uncaught exceptions anywhere below the root layout. Server-side
// logging already happened via instrumentation.ts's onRequestError before
// this ever renders — this is UI-only, and deliberately shows no error
// detail (message/stack) to the visitor, since the underlying cause could
// vary from "database briefly unreachable" to a bug that leaked something
// sensitive into the thrown error's message.
//
// It cannot render SiteHeader: an error boundary must be a client
// component, and SiteHeader is an async server component that reads the
// session cookie. So it carries its own minimal navigation instead — a
// retry alone is a dead end when the retry does not work, which is exactly
// the case where someone is looking at this page a second time.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <Link href="/" className="text-base font-semibold tracking-tight text-foreground">
        ApnaHealth
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted">
          We hit a problem loading this page. Please try again, or come back in a few minutes.
        </p>
      </div>

      <Button type="button" onClick={() => retry()}>
        Try again
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <Link href="/doctors" className="text-primary underline underline-offset-2">
          Find a doctor
        </Link>
        <Link href="/clinics" className="text-primary underline underline-offset-2">
          Clinics
        </Link>
        <Link href="/hospitals" className="text-primary underline underline-offset-2">
          Hospitals
        </Link>
        <Link href="/patient/appointments" className="text-primary underline underline-offset-2">
          My appointments
        </Link>
      </div>

      <p className="text-xs text-muted">
        If you have an appointment today, the clinic&apos;s reception can still check you in as usual.
      </p>
    </main>
  );
}
