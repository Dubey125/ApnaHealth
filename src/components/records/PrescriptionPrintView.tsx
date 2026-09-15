"use client";

import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { displayVitals } from "@/lib/records/vitals";

export interface PrescriptionData {
  doctorName: string;
  doctorSpecialty: string;
  doctorQualification: string;
  doctorRegNumber?: string | null;
  doctorRegCouncil?: string | null;
  clinicName: string;
  clinicAddress: string;
  clinicCity: string;
  clinicPhone: string;
  patientName: string;
  patientAge?: number | string | null;
  patientSex?: string | null;
  patientPhone?: string | null;
  tokenNumber?: number | null;
  consultedAt: Date | string;
  /**
   * Vitals, from their own columns.
   *
   * These used to reach the printed sheet by accident: the form stringified
   * them into clinicalAssessment, so they printed as part of "Clinical
   * Findings". Structuring them removed them from the page entirely — a
   * printed prescription with no blood pressure or weight, which is not
   * what a patient should be handed.
   */
  vitals?: {
    bloodPressureSystolic: number | null;
    bloodPressureDiastolic: number | null;
    pulseBpm: number | null;
    temperatureF: number | null;
    spo2Percent: number | null;
    weightKg: number | null;
  } | null;
  /**
   * Allergies that stand at the time of printing.
   *
   * On the sheet because this is the page a patient shows at a pharmacy
   * counter, and to a clinician who has never seen them. Printed as
   * recorded — nothing here is compared against the prescription above it.
   */
  allergies?: { id: string; substance: string }[];
  chiefComplaint?: string | null;
  clinicalAssessment?: string | null;
  diagnosisText?: string | null;
  prescriptionText?: string | null;
  /**
   * Structured medicines, when the record has them.
   *
   * Records written before medicines were structured have only
   * prescriptionText, and that is printed as written — parsing a
   * clinician's prescription prose back into drugs and doses would mean
   * guessing at a prescription.
   */
  medicines?: { id: string; name: string; dosage: string | null; timing: string | null; duration: string | null; notes: string | null }[];
  followUpInstructions?: string | null;
}

export function PrescriptionPrintView({ data }: { data: PrescriptionData }) {
  const consultDate = typeof data.consultedAt === "string" ? new Date(data.consultedAt) : data.consultedAt;
  const vitalRows = data.vitals ? displayVitals(data.vitals) : [];

  return (
    <div className="printable-prescription hidden print:block text-black bg-white p-6 max-w-3xl mx-auto font-sans leading-relaxed">
      {/* Clinic & Doctor Header */}
      <div className="border-b-2 border-teal-800 pb-4 mb-4 flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold text-teal-900 tracking-tight">{data.clinicName}</h1>
          <p className="text-xs text-gray-700">{data.clinicAddress}, {data.clinicCity}</p>
          <p className="text-xs text-gray-700">Ph: {data.clinicPhone}</p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-gray-900">{data.doctorName}</h2>
          <p className="text-xs font-semibold text-teal-800">{data.doctorSpecialty}</p>
          <p className="text-xs text-gray-700">{data.doctorQualification}</p>
          {data.doctorRegNumber && (
            <p className="text-xs text-gray-600">
              Reg No: {data.doctorRegNumber} {data.doctorRegCouncil ? `(${data.doctorRegCouncil})` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Patient Bar */}
      <div className="bg-slate-50 border border-slate-300 rounded p-3 mb-6 grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="font-semibold text-gray-700">Patient: </span>
          <span className="font-bold text-gray-900">{data.patientName}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Age / Sex: </span>
          <span>
            {data.patientAge ? `${data.patientAge} yrs` : "—"} / {data.patientSex || "—"}
          </span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Date: </span>
          <span>{formatClinicDate(consultDate)} {formatClinicTime(consultDate)}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Contact: </span>
          <span>{data.patientPhone || "—"}</span>
        </div>
        {data.tokenNumber != null && (
          <div>
            <span className="font-semibold text-gray-700">OPD Token: </span>
            <span className="font-bold">#{data.tokenNumber}</span>
          </div>
        )}
      </div>

      {/* Clinical Notes & Diagnosis */}
      <div className="space-y-4 mb-6">
        {data.allergies && data.allergies.length > 0 && (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-red-800 block mb-1">Allergies:</span>
            <p className="text-sm font-semibold text-gray-900 bg-red-50 p-2 rounded border border-red-300">
              {data.allergies.map((allergy) => allergy.substance).join(", ")}
            </p>
          </div>
        )}

        {vitalRows.length > 0 && (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-900 block mb-1">Vitals:</span>
            <p className="text-sm text-gray-800 bg-slate-50/50 p-2 rounded border border-slate-200">
              {vitalRows.map((vital) => `${vital.label} ${vital.value}`).join("   ")}
            </p>
          </div>
        )}
        {data.chiefComplaint && (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-900 block mb-1">Chief Complaints / History:</span>
            <p className="text-sm text-gray-800 bg-slate-50/50 p-2 rounded border border-slate-200">{data.chiefComplaint}</p>
          </div>
        )}

        {data.clinicalAssessment && (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-900 block mb-1">Clinical Findings / Examination:</span>
            <p className="text-sm text-gray-800 bg-slate-50/50 p-2 rounded border border-slate-200">{data.clinicalAssessment}</p>
          </div>
        )}

        {data.diagnosisText && (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-900 block mb-1">Diagnosis:</span>
            <p className="text-sm font-semibold text-gray-900 bg-teal-50/60 p-2 rounded border border-teal-200">{data.diagnosisText}</p>
          </div>
        )}
      </div>

      {/* Rx Section */}
      <div className="mt-6 pt-4 border-t-2 border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl font-serif font-bold text-teal-900 italic">℞</span>
          <span className="text-xs font-bold uppercase tracking-widest text-gray-700">Rx / Prescribed Medications</span>
        </div>
        
        <div className="bg-white border border-gray-300 rounded p-4 mb-6 min-h-[140px]">
          {data.medicines && data.medicines.length > 0 ? (
            /* A real table, which is the point of storing medicines as
               rows: a patient reading this at home needs to find one drug
               and its instructions, not parse a paragraph. */
            <table className="w-full border-collapse text-sm text-gray-900">
              <thead>
                <tr className="border-b border-gray-300 text-left text-[10px] uppercase tracking-wider text-gray-600">
                  <th className="py-1 pr-2 font-semibold">#</th>
                  <th className="py-1 pr-3 font-semibold">Medicine</th>
                  <th className="py-1 pr-3 font-semibold">Dose</th>
                  <th className="py-1 pr-3 font-semibold">When</th>
                  <th className="py-1 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.medicines.map((medicine, index) => (
                  <tr key={medicine.id} className="border-b border-gray-200 align-top last:border-0">
                    <td className="py-1.5 pr-2 tabular-nums text-gray-600">{index + 1}</td>
                    <td className="py-1.5 pr-3 font-semibold">
                      {medicine.name}
                      {medicine.notes && <span className="block text-xs font-normal text-gray-600">{medicine.notes}</span>}
                    </td>
                    {/* An unrecorded part prints blank, never as a dash: a
                        printed "—" reads as an instruction. */}
                    <td className="py-1.5 pr-3">{medicine.dosage ?? ""}</td>
                    <td className="py-1.5 pr-3">{medicine.timing ?? ""}</td>
                    <td className="py-1.5">{medicine.duration ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-gray-900 leading-relaxed font-mono">
              {data.prescriptionText || "No medicines prescribed."}
            </p>
          )}
        </div>
      </div>

      {/* Follow-up & Advice */}
      {data.followUpInstructions && (
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-teal-900 block mb-1">Advice & Follow-up Instructions:</span>
          <p className="text-sm text-gray-800 bg-slate-50 p-2.5 rounded border border-slate-200">{data.followUpInstructions}</p>
        </div>
      )}

      {/* Doctor Signature Block */}
      <div className="mt-16 pt-6 border-t border-gray-300 flex justify-between items-end text-xs text-gray-600">
        <div>
          <p className="font-medium text-gray-700">ApnaHealth Electronic Health Record</p>
          <p>Generated on {formatClinicDate(new Date())}</p>
        </div>
        <div className="text-right">
          <div className="h-10 mb-1 border-b border-gray-400 w-48 ml-auto"></div>
          <p className="font-bold text-gray-900">{data.doctorName}</p>
          <p>{data.doctorQualification}</p>
          {data.doctorRegNumber && <p>Reg: {data.doctorRegNumber}</p>}
        </div>
      </div>
    </div>
  );
}
