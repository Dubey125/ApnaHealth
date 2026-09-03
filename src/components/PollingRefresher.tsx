"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_POLL_INTERVAL_MS = 5000;

export function PollingRefresher({ intervalMs = DEFAULT_POLL_INTERVAL_MS }: { intervalMs?: number } = {}) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
