import { prisma } from "@/lib/db";
import { loadTokenForDoctorRecord } from "@/lib/records/loadTokenForDoctorRecord";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { ConsultationForm } from "./ConsultationForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { IconShield } from "@/components/ui/icons";

interface RecordPageProps {
  params: Promise<{ sessionId: string; tokenId: string }>;
}

// dateOfBirth is stored as a date-only column, so the comparison is done
// entirely in UTC parts — using local getters would shift the birthday by
// a day for anyone east or west of UTC and occasionally report the wrong
// age on the boundary.
function ageInYears(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="whitespace-pre-wrap text-sm text-foreground">{value}</span>
    </div>
  );
}

export default async function ConsultationRecordPage({ params }: RecordPageProps) {
  const { sessionId, tokenId } = await params;
  const { session, clinicSession, token } = await loadTokenForDoctorRecord(sessionId, tokenId);

  if (!token.patientId) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <PageHeader
          title="Consultation record"
          backHref={`/app/queue/${clinicSession.id}`}
          backLabel="Back to queue"
        />
        {/* Everything the counter captured for this walk-in. Without an
            account there is no stored history to show, but the doctor
            should still see who is in front of them and why. */}
        <Card className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{token.patientNameSnapshot}</h2>
            <Badge variant="neutral">Token #{token.tokenNumber}</Badge>
            <Badge variant="warning">Walk-in</Badge>
          </div>
          <p className="text-sm text-muted">
            {[
              token.patientAgeSnapshot != null ? `${token.patientAgeSnapshot} yrs` : null,
              token.patientSexSnapshot,
              token.patientPhoneSnapshot,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {token.reasonForVisit && (
            <p className="text-sm text-foreground">
              <span className="font-medium">Reason for visit:</span> {token.reasonForVisit}
            </p>
          )}
        </Card>
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
    // Scoped to this doctor's OWN prior records with this patient — a
    // doctor does not see another clinician's notes (PRIVACY_BOUNDARY.md,
    // and the visit-scoped consent model in actions.ts).
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

  const lastVisit = history[0] ?? null;
  const visitNumber = history.length + 1;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Consultation record" backHref={`/app/queue/${clinicSession.id}`} backLabel="Back to queue" />

      {/* Clinical context first: who is in front of the doctor, and how
          this visit sits relative to their previous ones. */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={patient.name} size={56} className="shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{patient.name}</h2>
              <Badge variant="neutral">Token #{token.tokenNumber}</Badge>
            </div>
            <p className="text-sm text-muted">
              {[
                patient.dateOfBirth ? `${ageInYears(patient.dateOfBirth, now)} yrs` : token.patientAgeSnapshot != null ? `${token.patientAgeSnapshot} yrs` : null,
                patient.sex ?? token.patientSexSnapshot,
                patient.phone,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {token.reasonForVisit && (
              <p className="text-sm text-foreground">
                <span className="font-medium">Reason for visit:</span> {token.reasonForVisit}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-3 text-sm">
          <span className="text-muted">
            Visit <span className="font-medium tabular-nums text-foreground">#{visitNumber}</span> with you
          </span>
          <span className="text-muted">
            Last seen{" "}
            <span className="font-medium text-foreground">
              {lastVisit ? formatClinicDate(lastVisit.consultedAt) : "first visit"}
            </span>
          </span>
          {token.consultStartedAt && (
            <span className="text-muted">
              In consult since <span className="font-medium text-foreground">{formatClinicTime(token.consultStartedAt)}</span>
            </span>
          )}
        </div>
      </Card>

      {existingRecord ? (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">This visit</h2>
            <span className="text-xs text-muted">
              Recorded {formatClinicDate(existingRecord.consultedAt)} {formatClinicTime(existingRecord.consultedAt)}
            </span>
          </div>
          {existingRecord.chiefComplaint && <Field label="Chief complaint" value={existingRecord.chiefComplaint} />}
          {existingRecord.clinicalAssessment && <Field label="Assessment" value={existingRecord.clinicalAssessment} />}
          {existingRecord.diagnosisText && <Field label="Diagnosis" value={existingRecord.diagnosisText} />}
          {existingRecord.prescriptionText && <Field label="Prescription" value={existingRecord.prescriptionText} />}
          {existingRecord.followUpInstructions && (
            <Field label="Follow-up" value={existingRecord.followUpInstructions} />
          )}
          <p className="border-t border-border pt-3 text-xs text-muted">
            Records cannot be edited after saving. Add a correction at the patient&apos;s next visit if needed.
          </p>
        </Card>
      ) : (
        <ConsultationForm sessionId={clinicSession.id} tokenId={token.id} />
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Your previous visits with this patient ({history.length})
        </h2>
        {history.length === 0 ? (
          <EmptyState
            title="No previous records"
            description="This is the first consultation you have recorded for this patient."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((record) => (
              <li key={record.id}>
                <Card className="flex flex-col gap-2 text-sm">
                  <p className="text-xs font-medium text-muted">
                    {formatClinicDate(record.consultedAt)} · {formatClinicTime(record.consultedAt)}
                  </p>
                  {record.chiefComplaint && <Field label="Complaint" value={record.chiefComplaint} />}
                  {record.diagnosisText && <Field label="Diagnosis" value={record.diagnosisText} />}
                  {record.followUpInstructions && <Field label="Follow-up" value={record.followUpInstructions} />}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* PRIVACY_BOUNDARY.md: record access is logged. Saying so plainly
          on the screen where it happens is part of that boundary being
          real rather than merely implemented. */}
      <p className="flex items-start gap-2 text-xs text-muted">
        <IconShield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Opening this record was logged against your account. You are seeing only your own previous consultations with
        this patient, not those of other clinicians.
      </p>
    </main>
  );
}
