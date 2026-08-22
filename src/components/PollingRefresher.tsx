"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

// Re-runs the server component on an interval so a second device (or a
// second browser tab) sees queue changes within ~5s, per QUEUE_RULES.md
// ("Polling is acceptable"). No client-side data fetching/merging: this
// just re-requests the page's server-rendered payload. Shared between the
// staff queue console and the patient ticket page (PHASE-14) — moved out
// of the queue route folder since it's no longer specific to one route.
export function PollingRefresher() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
