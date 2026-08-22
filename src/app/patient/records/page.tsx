import { requirePatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatClinicDate, formatClinicTime } from "@/lib/format";

// ACCESS_MATRIX.md: a patient can always view their own record — no
// consent check needed here, unlike the doctor-side record view. There is
// no route parameter identifying which patient's records to show; the
// query is always scoped to the logged-in session's own patientId.
export default async function PatientRecordsPage() {
  const session = await requirePatientSession();

  const records = await prisma.consultationRecord.findMany({
    where: { patientId: session.patientId },
    include: { doctor: true, clinic: true },
    orderBy: { consultedAt: "desc" },
  });

  const now = new Date();
  const clinicIds = [...new Set(records.map((record) => record.clinicId))];
  if (clinicIds.length > 0) {
    await prisma.recordAccessEvent.createMany({
      data: clinicIds.map((clinicId) => ({
        patientId: session.patientId,
        clinicId,
        action: "VIEW" as const,
        reason: "Patient self-view",
        occurredAt: now,
      })),
    });
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <PageHeader title="My consultation records" backHref="/patient/account" backLabel="Account" />
        {records.length === 0 ? (
          <EmptyState
            title="No consultation records yet"
            description="Records appear here after a doctor completes a consultation with you."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {records.map((record) => (
              <li key={record.id}>
                <Card className="flex flex-col gap-1.5 text-sm">
                  <p className="text-xs text-muted">
                    {formatClinicDate(record.consultedAt)} {formatClinicTime(record.consultedAt)} ·{" "}
                    {record.doctor.name} · {record.clinic.name}
                  </p>
                  {record.chiefComplaint && (
                    <p>
                      <span className="font-medium">Chief complaint:</span> {record.chiefComplaint}
                    </p>
                  )}
                  {record.clinicalAssessment && (
                    <p>
                      <span className="font-medium">Assessment:</span> {record.clinicalAssessment}
                    </p>
                  )}
                  {record.diagnosisText && (
                    <p>
                      <span className="font-medium">Diagnosis:</span> {record.diagnosisText}
                    </p>
                  )}
                  {record.prescriptionText && (
                    <p>
                      <span className="font-medium">Prescription:</span> {record.prescriptionText}
                    </p>
                  )}
                  {record.followUpInstructions && (
                    <p>
                      <span className="font-medium">Follow-up:</span> {record.followUpInstructions}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
