"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

// Same wiring as app/app/staff/CreatedToast.tsx: createDoctor redirects
// here with ?created=<id> since a Server Action can't call a client-side
// toast directly. Fires once, then strips the param.
export function CreatedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();
  const created = searchParams.get("created");

  useEffect(() => {
    if (!created) return;
    show("Doctor added", "success");
    router.replace("/app/doctors");
  }, [created, show, router]);

  return null;
}
