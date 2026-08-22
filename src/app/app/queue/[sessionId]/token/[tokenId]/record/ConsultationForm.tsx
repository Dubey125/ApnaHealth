"use client";

import { useActionState } from "react";
import { createConsultationRecord, type RecordActionState } from "./actions";
import { Textarea, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: RecordActionState = {};

export function ConsultationForm({ sessionId, tokenId }: { sessionId: string; tokenId: string }) {
  const [state, formAction, pending] = useActionState(createConsultationRecord, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <Label htmlFor="chiefComplaint">
        Chief complaint
        <Textarea id="chiefComplaint" name="chiefComplaint" rows={2} />
      </Label>
      <Label htmlFor="clinicalAssessment">
        Clinical assessment
        <Textarea id="clinicalAssessment" name="clinicalAssessment" rows={2} />
      </Label>
      <Label htmlFor="diagnosisText">
        Diagnosis
        <Textarea id="diagnosisText" name="diagnosisText" rows={2} />
      </Label>
      <Label htmlFor="prescriptionText">
        Prescription
        <Textarea id="prescriptionText" name="prescriptionText" rows={2} />
      </Label>
      <Label htmlFor="followUpInstructions">
        Follow-up instructions
        <Textarea id="followUpInstructions" name="followUpInstructions" rows={2} />
      </Label>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save consultation record"}
      </Button>
    </form>
  );
}
