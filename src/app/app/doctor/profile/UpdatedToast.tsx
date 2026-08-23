"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export function UpdatedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();
  const updated = searchParams.get("updated");

  useEffect(() => {
    if (!updated) return;
    show("Profile updated", "success");
    router.replace("/app/doctor/profile");
  }, [updated, show, router]);

  return null;
}
