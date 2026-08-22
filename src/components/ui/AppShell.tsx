import type { ReactNode } from "react";
import type { StaffRole } from "@/generated/prisma/enums";
import { AppNav } from "./AppNav";

// The persistent header/nav that PHASE-12's audit found completely
// missing under /app — every page was previously a bare <main> with no
// way to navigate except a raw URL. Deliberately does not add its own
// max-width/padding wrapper around children: each page keeps controlling
// its own inner layout (mx-auto max-w-* p-*), unchanged, so this can be
// wired in without touching page content — that's PHASE-13 onward.
export function AppShell({
  role,
  clinicName,
  children,
}: {
  role: StaffRole;
  clinicName: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{clinicName}</span>
            <span className="rounded-full bg-border/60 px-2 py-0.5 text-xs text-muted">{role.replace("_", " ")}</span>
          </div>
          <AppNav role={role} />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
