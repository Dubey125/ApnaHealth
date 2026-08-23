"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export function UpdatedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { show } = useToast();
  const updated = searchParams.get("updated");

  useEffect(() => {
    if (!updated) return;
    show("Staff account updated", "success");
    router.replace(pathname);
  }, [updated, show, router, pathname]);

  return null;
}
