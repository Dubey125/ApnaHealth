import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { ClinicForm } from "./ClinicForm";
import { UpdatedToast } from "./UpdatedToast";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function ClinicProfilePage() {
  const session = await requireStaffSession("OWNER");
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: session.clinicId } });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <UpdatedToast />
      <PageHeader title="Clinic profile" />
      <ClinicForm clinic={clinic} />
    </main>
  );
}
