import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";

// Nav and sign-out now live in the persistent header (AppShell, wired in
// via app/app/layout.tsx) — this page just needs to still exist as the
// "Home" destination. A proper per-role landing (PHASE-13/15/16/17) is
// deferred; this is presentation wiring only, not a new dashboard.
export default async function AppHome() {
  const session = await requireStaffSession();
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: session.clinicId } });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{clinic.name}</h1>
      <p className="text-sm text-muted">
        Signed in as <strong className="font-medium text-foreground">{session.role.replace("_", " ")}</strong>
        {session.doctorId ? " · linked to a doctor profile" : ""}.
      </p>
    </main>
  );
}
