import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/ui/AppShell";

// proxy.ts already redirects an unauthenticated visitor to /login before
// this ever runs (coarse gate); this just needs a valid session to know
// which clinic/role to render in the header — each page underneath still
// does its own role-specific requireStaffSession() check independently.
export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: session.clinicId } });

  return (
    <AppShell role={session.role} clinicName={clinic.name}>
      {children}
    </AppShell>
  );
}
