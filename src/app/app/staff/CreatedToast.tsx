"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

// Toast's first real wiring (PHASE-12 built it, unused until now): the
// create-staff action redirects here with ?created=<id> since a Server
// Action can't call a client-side toast directly. Fires once, then strips
// the param so a manual refresh doesn't re-announce it.
export function CreatedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();
  const created = searchParams.get("created");

  useEffect(() => {
    if (!created) return;
    show("Staff account created", "success");
    router.replace("/app/staff");
  }, [created, show, router]);

  return null;
}
