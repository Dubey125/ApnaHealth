import type { ReactNode } from "react";
import { requireAdminSession } from "@/lib/auth/admin";
import { AdminShell } from "@/components/ui/AdminShell";

// Single guard for every /admin route. proxy.ts additionally blocks the
// whole subtree before rendering starts (see the loading.tsx/streaming
// note there); this is the real check, not a duplicate of a cosmetic one.
// Never indexed. robots.txt asks crawlers not to fetch this subtree; this
// is the half that still holds if one ignores it, or if a URL is shared.
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession();
  return <AdminShell adminName={session.name}>{children}</AdminShell>;
}
