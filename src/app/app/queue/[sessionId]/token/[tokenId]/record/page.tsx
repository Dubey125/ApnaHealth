import { prisma } from "@/lib/db";
import { loadTokenForDoctorRecord } from "@/lib/records/loadTokenForDoctorRecord";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { ConsultationForm } from "./ConsultationForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";

interface RecordPageProps {
  params: Promise<{ sessionId: string; tokenId: string }>;
}

export default async function ConsultationRecordPage({ params }: RecordPageProps) {
  const { sessionId, tokenId } = await params;
  const { session, clinicSession, token } = await loadTokenForDoctorRecord(sessionId, tokenId);

  if (!token.patientId) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
        <PageHeader
          title="Consultation record"
          backHref={`/app/queue/${clinicSession.id}`}
          backLabel="Back to queue"
        />
        <p className="text-sm text-muted">
          {token.patientNameSnapshot} · #{token.tokenNumber}
        </p>
        <Alert variant="info">
          This visit has no linked patient account, so a clinical record cannot be attached to it. The patient can
          link future visits by registering or signing in with the same phone number before booking or checking in.
        </Alert>
      </main>
    );
  }

  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: token.patientId } });

  const [existingRecord, history] = await Promise.all([
    prisma.consultationRecord.findFirst({ where: { tokenId: token.id } }),
    prisma.consultationRecord.findMany({
      where: { patientId: patient.id, doctorId: session.doctorId, NOT: { tokenId: token.id } },
      orderBy: { consultedAt: "desc" },
      take: 10,
    }),
  ]);

  const now = new Date();
  await prisma.recordAccessEvent.create({
    data: {
      patientId: patient.id,
      clinicId: clinicSession.clinicId,
      doctorId: session.doctorId,
      staffUserId: session.staffUserId,
      action: "VIEW",
      reason: "Doctor opened consultation record",
      occurredAt: now,
    },
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Consultation record" backHref={`/app/queue/${clinicSession.id}`} backLabel="Back to queue" />

      <Card className="text-sm">
        <p className="font-medium text-foreground">{patient.name}</p>
        <p className="text-muted">
          {patient.phone} · #{token.tokenNumber}
        </p>
      </Card>

      {existingRecord ? (
        <Card className="flex flex-col gap-2 text-sm">
          <p className="text-xs text-muted">
            Recorded {formatClinicDate(existingRecord.consultedAt)} {formatClinicTime(existingRecord.consultedAt)}
          </p>
          {existingRecord.chiefComplaint && (
            <p>
              <span className="font-medium text-foreground">Chief complaint:</span> {existingRecord.chiefComplaint}
            </p>
          )}
          {existingRecord.clinicalAssessment && (
            <p>
              <span className="font-medium text-foreground">Assessment:</span> {existingRecord.clinicalAssessment}
            </p>
          )}
          {existingRecord.diagnosisText && (
            <p>
              <span className="font-medium text-foreground">Diagnosis:</span> {existingRecord.diagnosisText}
            </p>
          )}
          {existingRecord.prescriptionText && (
            <p>
              <span className="font-medium text-foreground">Prescription:</span> {existingRecord.prescriptionText}
            </p>
          )}
          {existingRecord.followUpInstructions && (
            <p>
              <span className="font-medium text-foreground">Follow-up:</span> {existingRecord.followUpInstructions}
            </p>
          )}
        </Card>
      ) : (
        <ConsultationForm sessionId={clinicSession.id} tokenId={token.id} />
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Previous visits with this patient ({history.length})</h2>
        {history.length === 0 ? (
          <EmptyState title="No previous consultation records" />
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((record) => (
              <li key={record.id}>
                <Card className="text-sm">
                  <p className="text-xs text-muted">
                    {formatClinicDate(record.consultedAt)} {formatClinicTime(record.consultedAt)}
                  </p>
                  {record.diagnosisText && <p className="mt-1 text-foreground">{record.diagnosisText}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
