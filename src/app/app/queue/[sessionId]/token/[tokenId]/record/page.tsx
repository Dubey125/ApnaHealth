import { prisma } from "@/lib/db";
import { loadTokenForDoctorRecord } from "@/lib/records/loadTokenForDoctorRecord";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { ConsultationForm } from "./ConsultationForm";
import { PrintPrescriptionButton } from "./PrintPrescriptionButton";
import { PrescriptionPrintView } from "@/components/records/PrescriptionPrintView";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { VitalsPanel } from "@/components/records/VitalsPanel";
import { AllergyPanel } from "@/components/records/AllergyPanel";
import { displayMedicine } from "@/lib/records/prescription";
import { EMPTY_VITALS, trendPointsFrom } from "@/lib/records/vitals";
import { VisitTypeCorrection } from "./VisitTypeCorrection";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { IconShield } from "@/components/ui/icons";

interface RecordPageProps {
  params: Promise<{ sessionId: string; tokenId: string }>;
}

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
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className="whitespace-pre-wrap text-sm text-foreground bg-background p-3 rounded-lg border border-border">
        {value}
      </span>
    </div>
  );
}

export default async function ConsultationRecordPage({ params }: RecordPageProps) {
  const { sessionId, tokenId } = await params;
  const { session, clinicSession, token } = await loadTokenForDoctorRecord(sessionId, tokenId);

  const doctor = await prisma.doctor.findUniqueOrThrow({
    where: { id: session.doctorId },
    include: { clinic: true },
  });

  if (!token.patientId) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <PageHeader
          title="Consultation record"
          backHref={`/app/queue/${clinicSession.id}`}
          backLabel="Back to queue"
        />
        <Card className="flex flex-col gap-2 p-5">
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
          This visit has no linked patient account, so an electronic health record cannot be persisted across visits.
          The patient can register or sign in with their phone number for future consultations.
        </Alert>
      </main>
    );
  }

  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: token.patientId } });

  const [existingRecord, history, allergies] = await Promise.all([
    prisma.consultationRecord.findFirst({
      where: { tokenId: token.id },
      include: { medicines: { orderBy: { position: "asc" } } },
    }),
    prisma.consultationRecord.findMany({
      where: { patientId: patient.id, doctorId: session.doctorId, NOT: { tokenId: token.id } },
      orderBy: { consultedAt: "desc" },
      take: 10,
    }),
    // Deliberately NOT scoped to this doctor, unlike the consultation
    // history above. An allergy is a fact about the person, and a doctor
    // seeing a patient for the first time must see one that somebody else
    // recorded — a record only its author can read creates false
    // confidence rather than safety. The treating-clinician gate
    // (loadTokenForDoctorRecord) is what authorises this read, and the
    // RecordAccessEvent written below logs it like any other.
    prisma.patientAllergy.findMany({
      where: { patientId: token.patientId },
      orderBy: { recordedAt: "desc" },
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
  const patientAge = patient.dateOfBirth
    ? ageInYears(patient.dateOfBirth, now)
    : token.patientAgeSnapshot;

  return (
    <>
      {/* Hidden Printable Prescription */}
      {existingRecord && (
        <PrescriptionPrintView
          data={{
            doctorName: doctor.name,
            doctorSpecialty: doctor.specialty,
            doctorQualification: doctor.qualificationText,
            doctorRegNumber: doctor.registrationNumber,
            doctorRegCouncil: doctor.registrationCouncil,
            clinicName: doctor.clinic.name,
            clinicAddress: doctor.clinic.addressLine,
            clinicCity: doctor.clinic.city,
            clinicPhone: doctor.clinic.phone,
            patientName: patient.name,
            patientAge: patientAge,
            patientSex: patient.sex ?? token.patientSexSnapshot,
            patientPhone: patient.phone,
            tokenNumber: token.tokenNumber,
            consultedAt: existingRecord.consultedAt,
            chiefComplaint: existingRecord.chiefComplaint,
            clinicalAssessment: existingRecord.clinicalAssessment,
            diagnosisText: existingRecord.diagnosisText,
            prescriptionText: existingRecord.prescriptionText,
            medicines: existingRecord.medicines,
            followUpInstructions: existingRecord.followUpInstructions,
          }}
        />
      )}

      <main className="mx-auto flex max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6 no-print">
        <PageHeader
          title="Consultation Workspace"
          backHref={`/app/queue/${clinicSession.id}`}
          backLabel="Back to queue"
          action={existingRecord ? <PrintPrescriptionButton /> : undefined}
        />

        {/* Patient Clinical Context Card */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={patient.name} size={64} className="shrink-0 ring-2 ring-primary/10" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold text-foreground">{patient.name}</h2>
                <Badge variant="neutral">Token #{token.tokenNumber}</Badge>
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  Visit #{visitNumber} with you
                </span>
              </div>
              <p className="text-sm text-muted">
                {[
                  patientAge != null ? `${patientAge} yrs` : null,
                  patient.sex ?? token.patientSexSnapshot,
                  patient.phone,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {token.reasonForVisit && (
                <div className="text-xs text-foreground bg-surface p-2 rounded border border-border mt-1">
                  <span className="font-semibold text-primary">Reported Chief Complaint:</span> {token.reasonForVisit}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-3 text-xs text-muted">
            <span>
              Last Seen:{" "}
              <span className="font-semibold text-foreground">
                {lastVisit ? `${formatClinicDate(lastVisit.consultedAt)} (${formatClinicTime(lastVisit.consultedAt)})` : "First consultation"}
              </span>
            </span>
            {token.consultStartedAt && (
              <span>
                Consultation Started:{" "}
                <span className="font-semibold text-foreground">{formatClinicTime(token.consultStartedAt)}</span>
              </span>
            )}
            {/* The doctor is the one who knows what this appointment
                actually was. Correcting it here does not change what this
                patient was told — it changes how long the queue thinks
                this doctor's appointments of this kind take, for every
                patient after them. */}
            <VisitTypeCorrection sessionId={clinicSession.id} tokenId={token.id} visitType={token.visitType} />
          </div>
        </Card>

        {/* Existing Record or Active Form */}
        {existingRecord ? (
          <Card className="flex flex-col gap-5 p-6 border-success/30 bg-success/5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="text-success text-base">✓</span>
                <h2 className="text-base font-bold text-foreground">Completed Consultation Record</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  Recorded {formatClinicDate(existingRecord.consultedAt)} at {formatClinicTime(existingRecord.consultedAt)}
                </span>
                <PrintPrescriptionButton />
              </div>
            </div>

            <AllergyPanel
              sessionId={clinicSession.id}
              tokenId={token.id}
              allergies={allergies}
              reviewedAt={patient.allergiesReviewedAt}
              readOnly
            />

            <VitalsPanel current={existingRecord} history={trendPointsFrom(history)} />

            {existingRecord.chiefComplaint && <Field label="Chief Complaints" value={existingRecord.chiefComplaint} />}
            {existingRecord.clinicalAssessment && (
              /* No longer "& Vitals": those are their own columns now, and
                 a label promising them here would be wrong for every record
                 written since. Records written BEFORE that change still
                 carry their vitals in this text, deliberately unparsed. */
              <Field label="Clinical Assessment" value={existingRecord.clinicalAssessment} />
            )}
            {existingRecord.diagnosisText && <Field label="Diagnosis" value={existingRecord.diagnosisText} />}
            {(existingRecord.medicines.length > 0 || existingRecord.prescriptionText) && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-serif font-bold text-primary italic">℞</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Prescribed Medicines</span>
                </div>
                {existingRecord.medicines.length > 0 ? (
                  <ol className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3.5">
                    {existingRecord.medicines.map((medicine, index) => {
                      const display = displayMedicine(medicine);
                      return (
                        <li key={medicine.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                          <span className="tabular-nums text-muted">{index + 1}.</span>
                          <span className="font-semibold text-foreground">{display.name}</span>
                          {display.instructions && <span className="text-foreground">{display.instructions}</span>}
                          {display.notes && <span className="text-muted">— {display.notes}</span>}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  /* Written before medicines were structured. Shown exactly
                     as the clinician wrote it — parsing prescription prose
                     back into drugs and doses means guessing at a
                     prescription. */
                  <div className="whitespace-pre-wrap font-mono text-xs bg-background p-3.5 rounded-lg border border-border text-foreground leading-relaxed">
                    {existingRecord.prescriptionText}
                  </div>
                )}
              </div>
            )}
            {existingRecord.followUpInstructions && (
              <Field label="Advice & Follow-Up" value={existingRecord.followUpInstructions} />
            )}

            <p className="border-t border-border pt-3 text-xs text-muted">
              🔒 This record is locked and safely recorded in the patient&apos;s longitudinal care timeline.
            </p>
          </Card>
        ) : (
          <>
            {/* Shown above the form, so previous readings are visible while
                today's are being taken rather than after they are saved. */}
            {/* Above the form, because the moment it has to be visible is
                while the prescription is being written — not after. */}
            <AllergyPanel
              sessionId={clinicSession.id}
              tokenId={token.id}
              allergies={allergies}
              reviewedAt={patient.allergiesReviewedAt}
            />

            <VitalsPanel current={EMPTY_VITALS} history={trendPointsFrom(history)} />
            <ConsultationForm sessionId={clinicSession.id} tokenId={token.id} />
          </>
        )}

        {/* Previous Consultation History */}
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-foreground">
            Previous Consultations with you ({history.length})
          </h2>
          {history.length === 0 ? (
            <EmptyState
              title="No previous records found"
              description="This is the first consultation recorded between you and this patient."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {history.map((record) => (
                <li key={record.id}>
                  <Card className="flex flex-col gap-2 p-4 text-xs">
                    <div className="flex justify-between items-center text-muted font-medium border-b border-border pb-2">
                      <span className="font-bold text-foreground">
                        {formatClinicDate(record.consultedAt)} · {formatClinicTime(record.consultedAt)}
                      </span>
                      {record.diagnosisText && (
                        <span className="text-primary font-semibold">{record.diagnosisText}</span>
                      )}
                    </div>
                    {record.chiefComplaint && (
                      <p className="text-foreground">
                        <span className="font-semibold text-muted">Complaint:</span> {record.chiefComplaint}
                      </p>
                    )}
                    {record.prescriptionText && (
                      <p className="text-foreground font-mono text-[11px] bg-surface p-2 rounded border border-border">
                        <span className="font-semibold font-sans text-muted">Rx: </span>
                        {record.prescriptionText}
                      </p>
                    )}
                    {record.followUpInstructions && (
                      <p className="text-muted">
                        <span className="font-semibold">Advice:</span> {record.followUpInstructions}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Privacy Notice */}
        <p className="flex items-start gap-2 text-xs text-muted">
          <IconShield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Access to this patient record is strictly audited. You are authorized to view and record consultations
          specifically for patients consulting in your active session.
        </p>
      </main>
    </>
  );
}
