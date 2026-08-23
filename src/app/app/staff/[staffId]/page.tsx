import { notFound } from "next/navigation";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { StaffEditForm } from "./StaffEditForm";
import { DeactivateForm } from "./DeactivateForm";
import { UpdatedToast } from "./UpdatedToast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

interface StaffDetailPageProps {
  params: Promise<{ staffId: string }>;
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const session = await requireStaffSession("OWNER");
  const { staffId } = await params;

  const staffUser = await prisma.staffUser.findUnique({ where: { id: staffId } });
  if (!staffUser) {
    notFound();
  }
  assertClinicAccess(session, staffUser.clinicId);

  const unlinkedDoctors = await prisma.doctor.findMany({
    where: {
      clinicId: session.clinicId,
      isActive: true,
      OR: [{ staffAccount: null }, { staffAccount: { id: staffUser.id } }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const isSelf = staffUser.id === session.staffUserId;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <UpdatedToast />
      <PageHeader
        title={staffUser.name}
        backHref="/app/staff"
        backLabel="Staff"
        action={<Badge variant={staffUser.isActive ? "success" : "neutral"}>{staffUser.isActive ? "Active" : "Inactive"}</Badge>}
      />

      <StaffEditForm staffUser={staffUser} unlinkedDoctors={unlinkedDoctors} />

      {isSelf ? (
        <p className="text-xs text-muted">You cannot deactivate your own account.</p>
      ) : (
        <DeactivateForm staffUserId={staffUser.id} isActive={staffUser.isActive} />
      )}
    </main>
  );
}
