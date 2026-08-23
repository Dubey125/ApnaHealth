"use client";

import { useActionState } from "react";
import { createConsultationRecord, type RecordActionState } from "./actions";
import { Textarea, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: RecordActionState = {};

// Grouped into the order a consultation actually runs — what the patient
// reports, what the clinician finds, then what the patient leaves with —
// rather than five identical undifferentiated boxes.
//
// Placeholders are prompts for the clinician's own words, never suggested
// clinical content: PRIVACY_BOUNDARY.md is explicit that records are
// clinician-authored and that this product performs no diagnosis or
// prescribing of its own.
export function ConsultationForm({ sessionId, tokenId }: { sessionId: string; tokenId: string }) {
  const [state, formAction, pending] = useActionState(createConsultationRecord, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Record this visit</h2>
        <span className="text-xs text-muted">Every field is optional — fill in what applies</span>
      </div>

      <div className="flex flex-col gap-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted/80">Presenting</div>
        <Label htmlFor="chiefComplaint">
          Chief complaint
          <Textarea
            id="chiefComplaint"
            name="chiefComplaint"
            rows={2}
            placeholder="What the patient reports, in their own words"
          />
        </Label>
        <Label htmlFor="clinicalAssessment">
          Clinical assessment
          <Textarea
            id="clinicalAssessment"
            name="clinicalAssessment"
            rows={3}
            placeholder="Examination findings and clinical reasoning"
          />
        </Label>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted/80">Conclusion</div>
        <Label htmlFor="diagnosisText">
          Diagnosis
          <Textarea id="diagnosisText" name="diagnosisText" rows={2} placeholder="Your diagnosis for this visit" />
        </Label>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted/80">Patient takes away</div>
        <Label htmlFor="prescriptionText">
          Prescription
          <Textarea
            id="prescriptionText"
            name="prescriptionText"
            rows={3}
            placeholder="Medication, dosage and duration as you would write it"
          />
        </Label>
        <Label htmlFor="followUpInstructions">
          Follow-up instructions
          <Textarea
            id="followUpInstructions"
            name="followUpInstructions"
            rows={2}
            placeholder="When to return, warning signs to watch for"
          />
        </Label>
      </div>

      <FormError>{state.error}</FormError>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Saving..." : "Save consultation record"}
        </Button>
        <p className="text-xs text-muted">
          Saved once and cannot be edited afterwards. The patient will be able to read this in their own health
          history.
        </p>
      </div>
    </form>
  );
}
