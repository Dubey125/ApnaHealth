import type { ReactNode } from "react";
import { requireAdminSession } from "@/lib/auth/admin";
import { AdminShell } from "@/components/ui/AdminShell";

// Single guard for every /admin route. proxy.ts additionally blocks the
// whole subtree before rendering starts (see the loading.tsx/streaming
// note there); this is the real check, not a duplicate of a cosmetic one.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();
  return <AdminShell adminName={session.name}>{children}</AdminShell>;
}
