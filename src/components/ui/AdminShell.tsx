import type { ReactNode } from "react";
import Link from "next/link";
import { AdminNav } from "./AdminNav";
import { adminLogout } from "@/app/admin/actions";

// Chrome for the platform review console. Deliberately NOT AppShell: that
// is a clinic's workspace, scoped to one tenant, and reusing it would blur
// exactly the line this console exists to draw. A reviewer is looking
// across every facility on ApnaHealth, so the chrome says "ApnaHealth
// Admin", carries no clinic name, and uses a top bar rather than the
// clinic sidebar's section list.
export function AdminShell({ adminName, children }: { adminName: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-base font-semibold tracking-tight text-foreground">
              ApnaHealth <span className="text-muted">Admin</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <AdminNav />
            <span className="hidden text-sm text-muted sm:inline">{adminName}</span>
            <form action={adminLogout}>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-border/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
