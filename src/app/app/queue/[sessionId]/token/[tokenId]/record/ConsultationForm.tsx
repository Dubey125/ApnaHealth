"use client";

import { useActionState, useState } from "react";
import { createConsultationRecord, type RecordActionState } from "./actions";
import { Textarea, Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

interface MedicineRow {
  name: string;
  dosage: string;
  timing: string;
  duration: string;
  notes: string;
}

const COMMON_CHIEF_COMPLAINTS = [
  "Fever & Chills",
  "Productive Cough & Cold",
  "Headache & Malaise",
  "Acute Acidity / GERD",
  "Hypertension follow-up",
  "Type 2 Diabetes review",
  "Lower Back / Knee Joint Pain",
  "Skin Itching / Allergic Rash",
];

const COMMON_DIAGNOSES = [
  "Acute Viral Upper Respiratory Infection",
  "Essential Hypertension (I10)",
  "Type 2 Diabetes Mellitus (E11)",
  "Acute Gastritis / GERD (K29.7)",
  "Allergic Dermatitis (L23)",
  "Acute Lumbar Strain / Myalgia (M54.5)",
  "Seasonal Allergic Rhinitis (J30.2)",
];

const initialState: RecordActionState = {};

export function ConsultationForm({ sessionId, tokenId }: { sessionId: string; tokenId: string }) {
  const [state, formAction, pending] = useActionState(createConsultationRecord, initialState);

  // Vitals state
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [temp, setTemp] = useState("");
  const [spo2, setSpo2] = useState("");
  const [weight, setWeight] = useState("");

  // Clinical text fields
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalAssessment, setClinicalAssessment] = useState("");
  const [diagnosisText, setDiagnosisText] = useState("");
  const [followUpInstructions, setFollowUpInstructions] = useState("");

  // Medicine prescription rows
  const [medicines, setMedicines] = useState<MedicineRow[]>([
    { name: "", dosage: "1-0-1", timing: "After Food (भोजन के बाद)", duration: "5 days", notes: "" },
  ]);

  const addMedicineRow = () => {
    setMedicines((prev) => [
      ...prev,
      { name: "", dosage: "1-0-1", timing: "After Food (भोजन के बाद)", duration: "5 days", notes: "" },
    ]);
  };

  const removeMedicineRow = (index: number) => {
    setMedicines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMedicine = (index: number, field: keyof MedicineRow, value: string) => {
    setMedicines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Compile formatted prescription text before submitting
  const formattedPrescriptionText = medicines
    .filter((m) => m.name.trim().length > 0)
    .map((m, idx) => `${idx + 1}. ${m.name.trim()} | Dose: ${m.dosage} | Timing: ${m.timing} | Duration: ${m.duration}${m.notes ? ` | Note: ${m.notes}` : ""}`)
    .join("\n");

  // Vitals used to be flattened into the assessment text here, as
  // "[Vitals: BP: 130/85 mmHg - Pulse: 78 bpm]". That recorded the
  // numbers and destroyed them as data in the same motion: nothing could
  // chart a blood pressure across visits, because the reading was inside
  // a paragraph.
  //
  // They now post as named fields into their own columns (see
  // src/lib/records/vitals.ts), and the assessment holds only what the
  // clinician actually wrote.

  return (
    <form action={formAction} className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <input type="hidden" name="prescriptionText" value={formattedPrescriptionText} />
      <input type="hidden" name="clinicalAssessment" value={clinicalAssessment} />
      <input type="hidden" name="chiefComplaint" value={chiefComplaint} />
      <input type="hidden" name="diagnosisText" value={diagnosisText} />
      <input type="hidden" name="followUpInstructions" value={followUpInstructions} />

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Active Clinical Consultation</h2>
          <p className="text-xs text-muted">Author clinician-verified consultation record and E-Prescription.</p>
        </div>
        <span className="text-xs text-primary font-medium bg-primary/10 px-2.5 py-1 rounded-full">
          Point of Care
        </span>
      </div>

      {/* 1. Vitals Recording Strip */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">Patient Vitals</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">BP (mmHg)</label>
            <div className="flex items-center gap-1">
              <Input
                placeholder="120"
                value={bpSystolic}
                name="bloodPressureSystolic"
                aria-label="Blood pressure, systolic"
                inputMode="numeric"
                onChange={(e) => setBpSystolic(e.target.value)}
                className="h-9 px-2 text-xs"
              />
              <span className="text-xs text-muted">/</span>
              <Input
                placeholder="80"
                value={bpDiastolic}
                name="bloodPressureDiastolic"
                aria-label="Blood pressure, diastolic"
                inputMode="numeric"
                onChange={(e) => setBpDiastolic(e.target.value)}
                className="h-9 px-2 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Pulse (bpm)</label>
            <Input
              placeholder="72"
              value={pulse}
              name="pulseBpm"
              aria-label="Pulse in beats per minute"
              inputMode="numeric"
              onChange={(e) => setPulse(e.target.value)}
              className="h-9 px-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Temp (°F)</label>
            <Input
              placeholder="98.6"
              value={temp}
              name="temperatureF"
              aria-label="Temperature in Fahrenheit"
              inputMode="decimal"
              onChange={(e) => setTemp(e.target.value)}
              className="h-9 px-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">SpO2 (%)</label>
            <Input
              placeholder="99"
              value={spo2}
              name="spo2Percent"
              aria-label="Oxygen saturation percentage"
              inputMode="numeric"
              onChange={(e) => setSpo2(e.target.value)}
              className="h-9 px-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted block mb-1">Weight (kg)</label>
            <Input
              placeholder="68"
              value={weight}
              name="weightKg"
              aria-label="Weight in kilograms"
              inputMode="decimal"
              onChange={(e) => setWeight(e.target.value)}
              className="h-9 px-2 text-xs"
            />
          </div>
        </div>
      </div>

      {/* 2. Chief Complaints & Examination */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="chiefComplaint">
            Chief Complaints &amp; History
            <Textarea
              id="chiefComplaint"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              rows={2}
              placeholder="e.g. High fever with chills since 2 days, sore throat"
            />
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_CHIEF_COMPLAINTS.map((cc) => (
              <button
                key={cc}
                type="button"
                onClick={() => setChiefComplaint((prev) => (prev ? `${prev}, ${cc}` : cc))}
                className="text-[11px] rounded-full border border-border bg-background px-2.5 py-1 text-muted hover:border-primary/50 hover:text-foreground transition-colors"
              >
                + {cc}
              </button>
            ))}
          </div>
        </div>

        <Label htmlFor="clinicalAssessment">
          Clinical Examination Findings &amp; Observations
          <Textarea
            id="clinicalAssessment"
            value={clinicalAssessment}
            onChange={(e) => setClinicalAssessment(e.target.value)}
            rows={2}
            placeholder="e.g. Throat congested, tonsils enlarged, chest clear bilaterally"
          />
        </Label>
      </div>

      {/* 3. Diagnosis & ICD-10 */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Label htmlFor="diagnosisText">
          Diagnosis / Clinical Impression
          <Input
            id="diagnosisText"
            value={diagnosisText}
            onChange={(e) => setDiagnosisText(e.target.value)}
            placeholder="e.g. Acute Pharyngitis / Viral Fever"
          />
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_DIAGNOSES.map((diag) => (
            <button
              key={diag}
              type="button"
              onClick={() => setDiagnosisText(diag)}
              className="text-[11px] rounded-full border border-border bg-background px-2.5 py-1 text-muted hover:border-primary/50 hover:text-foreground transition-colors"
            >
              + {diag}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Structured Rx Medication Builder */}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-serif font-bold text-primary italic">℞</span>
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Prescribed Medications</span>
          </div>
          <button
            type="button"
            onClick={addMedicineRow}
            className="text-xs font-semibold text-primary hover:underline"
          >
            + Add Medicine
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {medicines.map((med, idx) => (
            <div key={idx} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-foreground">Medicine #{idx + 1}</span>
                {medicines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMedicineRow(idx)}
                    className="text-danger hover:underline text-xs"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Input
                    placeholder="Drug Name & Strength (e.g. Tab Dolo 650mg)"
                    value={med.name}
                    onChange={(e) => updateMedicine(idx, "name", e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <select
                    value={med.dosage}
                    onChange={(e) => updateMedicine(idx, "dosage", e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
                  >
                    <option value="1-0-1">1-0-1 (Morning - Night)</option>
                    <option value="1-1-1">1-1-1 (Thrice daily)</option>
                    <option value="1-0-0">1-0-0 (Morning only)</option>
                    <option value="0-0-1">0-0-1 (Night only)</option>
                    <option value="0-1-0">0-1-0 (Afternoon only)</option>
                    <option value="SOS">SOS (As needed)</option>
                    <option value="Stat">Stat (Immediate once)</option>
                  </select>
                </div>
                <div>
                  <select
                    value={med.timing}
                    onChange={(e) => updateMedicine(idx, "timing", e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
                  >
                    <option value="After Food (भोजन के बाद)">After Food (भोजन के बाद)</option>
                    <option value="Before Food (भोजन से पहले)">Before Food (भोजन से पहले)</option>
                    <option value="With Food (भोजन के साथ)">With Food (भोजन के साथ)</option>
                    <option value="Empty Stomach (खाली पेट)">Empty Stomach (खाली पेट)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Duration (e.g. 5 days, 1 month)"
                  value={med.duration}
                  onChange={(e) => updateMedicine(idx, "duration", e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Special Instructions (e.g. with warm water)"
                  value={med.notes}
                  onChange={(e) => updateMedicine(idx, "notes", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Follow-up Advice */}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <Label htmlFor="followUpInstructions">
          Advice &amp; Follow-up Instructions
          <Textarea
            id="followUpInstructions"
            value={followUpInstructions}
            onChange={(e) => setFollowUpInstructions(e.target.value)}
            rows={2}
            placeholder="e.g. Adequate oral hydration, review after 5 days if fever persists or sooner in emergency"
          />
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {["Review after 3 days", "Review after 5 days", "Review after 1 week", "Review in 1 month", "SOS if symptoms worsen"].map((fu) => (
            <button
              key={fu}
              type="button"
              onClick={() => setFollowUpInstructions((prev) => (prev ? `${prev}. ${fu}` : fu))}
              className="text-[11px] rounded-full border border-border bg-background px-2.5 py-1 text-muted hover:border-primary/50 hover:text-foreground transition-colors"
            >
              + {fu}
            </button>
          ))}
        </div>
      </div>

      <FormError>{state.error}</FormError>

      {/* Save Action */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={pending} size="lg" className="w-full font-bold shadow-sm">
          {pending ? "Recording Consultation..." : "Save & Complete Consultation Record"}
        </Button>
        <p className="text-xs text-muted text-center">
          🔒 Records are permanent and clinician-authored. The patient can access this prescription from their longitudinal health locker.
        </p>
      </div>
    </form>
  );
}
