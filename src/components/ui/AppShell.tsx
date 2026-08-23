import type { ReactNode } from "react";
import type { StaffRole } from "@/generated/prisma/enums";
import { AppSidebar } from "./AppSidebar";

// The staff workspace chrome: a persistent sidebar on desktop, a slide-over
// drawer on mobile. AppSidebar renders both affordances itself (the rail is
// `hidden lg:flex`, the top bar is `lg:hidden`), so it is mounted once here
// and the container just switches axis at the same breakpoint.
//
// Deliberately does not impose its own max-width or padding on children:
// every page under /app already controls its own inner layout
// (mx-auto max-w-* p-*), which now centres inside the content column
// rather than the full viewport.
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
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <AppSidebar role={role} clinicName={clinicName} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
