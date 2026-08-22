"use client";

import { Button } from "@/components/ui/Button";

// Catches uncaught exceptions anywhere below the root layout. Server-side
// logging already happened via instrumentation.ts's onRequestError before
// this ever renders — this is UI-only, and deliberately shows no error
// detail (message/stack) to the visitor, since the underlying cause could
// vary from "database briefly unreachable" to a bug that leaked something
// sensitive into the thrown error's message.
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted">
        We hit a problem loading this page. Please try again, or come back in a few minutes.
      </p>
      <Button type="button" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
