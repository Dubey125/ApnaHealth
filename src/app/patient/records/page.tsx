import { requirePatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { PrintPrescriptionButton } from "@/app/app/queue/[sessionId]/token/[tokenId]/record/PrintPrescriptionButton";
import { PrescriptionPrintView } from "@/components/records/PrescriptionPrintView";
import { displayVitals } from "@/lib/records/vitals";
import { displayMedicine } from "@/lib/records/prescription";
import { amendedFields, inOrder } from "@/lib/records/amendments";
import { AllergySummaryCard } from "@/components/records/AllergySummaryCard";

export default async function PatientRecordsPage() {
  const session = await requirePatientSession();

  const [patient, records, allergies] = await Promise.all([
    prisma.patient.findUniqueOrThrow({ where: { id: session.patientId } }),
    prisma.consultationRecord.findMany({
      where: { patientId: session.patientId },
      include: {
        doctor: true,
        clinic: true,
        // Structured medicines. Without these a patient sees NOTHING where
        // their prescription should be: records written since medicines
        // became rows leave prescriptionText null.
        medicines: { orderBy: { position: "asc" } },
        // Amendments matter more to the patient than to anyone. They may
        // have acted on the original — taken a medicine, believed a
        // diagnosis — and are the last person who should find out from
        // somebody else that it was corrected.
        amendments: { orderBy: { amendedAt: "asc" }, include: { doctor: { select: { name: true } } } },
      },
      orderBy: { consultedAt: "desc" },
    }),
    prisma.patientAllergy.findMany({
      where: { patientId: session.patientId },
      orderBy: { recordedAt: "desc" },
    }),
  ]);

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

  const uniqueDoctors = new Set(records.map((r) => r.doctorId)).size;
  const uniqueClinics = clinicIds.length;

  return (
    <>
      <div className="no-print">
        <SiteHeader />
      </div>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 no-print">
        <PageHeader
          title="Digital Health Locker"
          backHref="/patient/account"
          backLabel="My Account"
        />

        {/* Health Locker Summary Banner */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-surface to-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Your consultation history
              </span>
              <h2 className="text-xl font-bold text-foreground mt-1">{patient.name}&apos;s Health Record</h2>
              <p className="text-xs text-muted">
                Phone: {patient.phone} {patient.email ? `· ${patient.email}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-4 text-center">
              <div className="rounded-xl border border-border bg-background px-4 py-2">
                <div className="text-xl font-bold tabular-nums text-foreground">{records.length}</div>
                <div className="text-[10px] text-muted uppercase font-semibold">Consults</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-2">
                <div className="text-xl font-bold tabular-nums text-foreground">{uniqueDoctors}</div>
                <div className="text-[10px] text-muted uppercase font-semibold">Doctors</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-2">
                <div className="text-xl font-bold tabular-nums text-foreground">{uniqueClinics}</div>
                <div className="text-[10px] text-muted uppercase font-semibold">Clinics</div>
              </div>
            </div>
          </div>
        </div>

        <AllergySummaryCard allergies={allergies} reviewedAt={patient.allergiesReviewedAt} />

        {records.length === 0 ? (
          <EmptyState
            title="No consultation records yet"
            description="Your consultation notes, diagnoses, and prescriptions will appear here automatically after your doctor completes a visit."
          />
        ) : (
          <div className="flex flex-col gap-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Chronological Care Timeline</h3>
            <ul className="flex flex-col gap-4">
              {records.map((record) => (
                <li key={record.id}>
                  {/* Hidden printable prescription block for printing */}
                  <PrescriptionPrintView
                    data={{
                      doctorName: record.doctor.name,
                      doctorSpecialty: record.doctor.specialty,
                      doctorQualification: record.doctor.qualificationText,
                      doctorRegNumber: record.doctor.registrationNumber,
                      doctorRegCouncil: record.doctor.registrationCouncil,
                      clinicName: record.clinic.name,
                      clinicAddress: record.clinic.addressLine,
                      clinicCity: record.clinic.city,
                      clinicPhone: record.clinic.phone,
                      patientName: patient.name,
                      patientAge: patient.dateOfBirth
                        ? now.getUTCFullYear() - patient.dateOfBirth.getUTCFullYear()
                        : null,
                      patientSex: patient.sex,
                      patientPhone: patient.phone,
                      consultedAt: record.consultedAt,
                      chiefComplaint: record.chiefComplaint,
                      clinicalAssessment: record.clinicalAssessment,
                      diagnosisText: record.diagnosisText,
                      prescriptionText: record.prescriptionText,
                      medicines: record.medicines,
                      followUpInstructions: record.followUpInstructions,
                    }}
                  />

                  <Card className="flex flex-col gap-4 p-5 hover:border-primary/40 transition-colors">
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-foreground">{record.doctor.name}</h4>
                          {record.doctor.verificationStatus === "VERIFIED" && (
                            <VerificationStatusBadge status={record.doctor.verificationStatus} />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-primary">{record.doctor.specialty}</p>
                        <p className="text-xs text-muted">
                          {record.clinic.name} · {record.clinic.city}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs font-medium text-foreground tabular-nums">
                          {formatClinicDate(record.consultedAt)} at {formatClinicTime(record.consultedAt)}
                        </span>
                        <PrintPrescriptionButton />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="grid gap-3 text-xs">
                      {record.diagnosisText && (
                        <div className="rounded-lg bg-teal-500/10 border border-teal-500/20 p-3">
                          <span className="font-bold text-primary block mb-0.5">Primary Diagnosis</span>
                          <p className="text-sm font-semibold text-foreground">{record.diagnosisText}</p>
                        </div>
                      )}

                      {record.chiefComplaint && (
                        <div>
                          <span className="font-bold text-muted block mb-0.5 uppercase tracking-wider text-[10px]">
                            Reported Symptoms &amp; History
                          </span>
                          <p className="text-foreground bg-surface p-2.5 rounded border border-border">
                            {record.chiefComplaint}
                          </p>
                        </div>
                      )}

                      {displayVitals(record).length > 0 && (
                        <div>
                          <span className="font-bold text-muted block mb-0.5 uppercase tracking-wider text-[10px]">
                            Vitals Recorded
                          </span>
                          <dl className="flex flex-wrap gap-x-5 gap-y-1 rounded border border-border bg-surface p-2.5">
                            {displayVitals(record).map((vital) => (
                              <div key={vital.key} className="flex items-baseline gap-1.5">
                                <dt className="text-muted">{vital.label}</dt>
                                <dd className="font-semibold tabular-nums text-foreground">{vital.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {record.clinicalAssessment && (
                        <div>
                          <span className="font-bold text-muted block mb-0.5 uppercase tracking-wider text-[10px]">
                            Clinical Findings &amp; Vitals
                          </span>
                          <p className="text-foreground bg-surface p-2.5 rounded border border-border whitespace-pre-wrap">
                            {record.clinicalAssessment}
                          </p>
                        </div>
                      )}

                      {(record.medicines.length > 0 || record.prescriptionText) && (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-base font-serif font-bold text-primary italic">℞</span>
                            <span className="font-bold text-muted uppercase tracking-wider text-[10px]">
                              Prescribed Medications
                            </span>
                          </div>
                          {record.medicines.length > 0 ? (
                            <ol className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3">
                              {record.medicines.map((medicine, index) => {
                                const display = displayMedicine(medicine);
                                return (
                                  <li key={medicine.id} className="flex flex-wrap items-baseline gap-2">
                                    <span className="tabular-nums text-muted">{index + 1}.</span>
                                    <span className="font-semibold text-foreground">{display.name}</span>
                                    {display.instructions && (
                                      <span className="text-foreground">{display.instructions}</span>
                                    )}
                                    {display.notes && <span className="text-muted">{display.notes}</span>}
                                  </li>
                                );
                              })}
                            </ol>
                          ) : (
                            <div className="whitespace-pre-wrap font-mono text-xs bg-background p-3 rounded-lg border border-border text-foreground leading-relaxed">
                              {record.prescriptionText}
                            </div>
                          )}
                        </div>
                      )}

                      {record.followUpInstructions && (
                        <div className="border-t border-border pt-2">
                          <span className="font-bold text-muted block mb-0.5 uppercase tracking-wider text-[10px]">
                            Doctor Advice &amp; Follow-up
                          </span>
                          <p className="text-foreground bg-surface p-2 rounded border border-border">
                            {record.followUpInstructions}
                          </p>
                        </div>
                      )}

                      {record.amendments.length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-border pt-2">
                          <span className="font-bold text-warning uppercase tracking-wider text-[10px]">
                            Corrections to this record ({record.amendments.length})
                          </span>
                          {/* The original above is left exactly as written and
                              never hidden: the patient needs to see both what
                              they were first told and what replaced it. */}
                          {inOrder(record.amendments).map((amendment) => (
                            <div key={amendment.id} className="rounded-lg border border-warning/40 bg-warning/5 p-2.5">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-medium text-foreground">{amendment.reason}</span>
                                <span className="text-[10px] text-muted">
                                  {amendment.doctor.name} {formatClinicDate(amendment.amendedAt)}
                                </span>
                              </div>
                              {amendedFields(amendment).map((field) => (
                                <div key={field.field} className="mt-1">
                                  <span className="text-[10px] uppercase tracking-wide text-muted">{field.label}</span>
                                  <p className="whitespace-pre-wrap text-foreground">{field.value}</p>
                                </div>
                              ))}
                              {amendment.note && (
                                <p className="mt-1 whitespace-pre-wrap text-foreground">{amendment.note}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <div className="no-print">
        <Footer />
      </div>
    </>
  );
}
