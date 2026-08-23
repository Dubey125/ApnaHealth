import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { DoctorProfileForm } from "./DoctorProfileForm";
import { UpdatedToast } from "./UpdatedToast";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";

export default async function DoctorSelfProfilePage() {
  const session = await requireStaffSession("DOCTOR");
  if (!session.doctorId) {
    throw new Error("This staff account is not linked to a doctor profile.");
  }

  const doctor = await prisma.doctor.findUniqueOrThrow({ where: { id: session.doctorId } });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <UpdatedToast />
      <PageHeader
        title="My profile"
        backHref="/app/doctor"
        backLabel="Today's sessions"
        action={<VerificationStatusBadge status={doctor.verificationStatus} />}
      />
      <p className="text-sm text-muted">
        {doctor.name} · {doctor.specialty}. Name, specialty and registration details are managed by your clinic owner
        as part of verification.
      </p>
      <DoctorProfileForm doctor={doctor} />
    </main>
  );
}
