import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/ui/AppShell";
import { ApprovalBanner } from "@/components/ui/ApprovalBanner";
import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
import { loadClinicBilling } from "@/lib/billing/load";

// proxy.ts already redirects an unauthenticated visitor to /login before
// this ever runs (coarse gate); this just needs a valid session to know
// which clinic/role to render in the header — each page underneath still
// does its own role-specific requireStaffSession() check independently.
// Never indexed. robots.txt asks crawlers not to fetch this subtree; this
// is the half that still holds if one ignores it, or if a URL is shared.
export const metadata = { robots: { index: false, follow: false } };

export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: session.clinicId } });
  // Loaded in the layout, so the commercial state is evaluated on every
  // staff page load — which is also what advances the clock (see
  // loadClinicBilling; there is no scheduler in this stack).
  const billing = await loadClinicBilling(session.clinicId);

  return (
    <AppShell role={session.role} clinicName={clinic.name} hasDoctorProfile={!!session.doctorId}>
      {/* Sits above every staff page rather than on the dashboard alone:
          a facility that hasn't cleared review needs to know that wherever
          they are, not only if they happen to visit /app. */}
      <ApprovalBanner status={clinic.approvalStatus} notes={clinic.approvalNotes} />
      {/* Same reasoning as the approval banner: a clinic whose payment
          failed needs to know wherever they are, not only if they
          happen to open the billing page. */}
      <SubscriptionBanner entitlements={billing.entitlements} daysLeft={billing.daysLeft} />
      {children}
    </AppShell>
  );
}
