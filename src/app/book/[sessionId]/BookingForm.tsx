"use client";

import { useActionState, useState } from "react";
import { selfBookToken, type BookingState } from "./actions";
import { Input, Label, Select } from "@/components/ui/Input";
import { PATIENT_VISIT_TYPES } from "@/lib/queue/visitTypes";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const COMMON_REASONS = [
  "General Consultation / Fever",
  "Follow-up Review",
  "Blood Pressure / Diabetes Check",
  "Severe Cough / Cold",
  "Stomach Pain / Acidity",
  "Joint / Muscle Pain",
  "Skin / Allergy Issue",
  "Routine Checkup",
];

const initialState: BookingState = {};

interface BookingFormProps {
  sessionId: string;
  defaultName?: string;
  defaultPhone?: string;
}

export function BookingForm({ sessionId, defaultName = "", defaultPhone = "" }: BookingFormProps) {
  const [state, formAction, pending] = useActionState(selfBookToken, initialState);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <input type="hidden" name="sessionId" value={sessionId} />
      
      <div className="flex flex-col gap-1 border-b border-border pb-3">
        <h2 className="text-base font-bold text-foreground">Patient Information</h2>
        <p className="text-xs text-muted">Enter details for the person visiting the doctor.</p>
      </div>

      <Label htmlFor="patientName">
        Patient Full Name
        <Input
          id="patientName"
          name="patientName"
          defaultValue={defaultName}
          placeholder="e.g. Ramesh Kumar"
          required
        />
      </Label>

      <Label htmlFor="patientPhone">
        Mobile Phone Number
        <Input
          id="patientPhone"
          name="patientPhone"
          type="tel"
          defaultValue={defaultPhone}
          placeholder="e.g. 9876543210"
          required
        />
      </Label>

      {/* Have you seen this doctor before? A patient can answer this
          reliably, and it lets the queue estimate a follow-up as the
          shorter appointment it usually is. "Not sure" is a real answer
          and costs nothing — the prediction just falls back to the
          overall median. */}
      <Label htmlFor="visitType">
        Have you seen this doctor before?
        <Select id="visitType" name="visitType" defaultValue="">
          <option value="">Not sure</option>
          {PATIENT_VISIT_TYPES.map((visitType) => (
            <option key={visitType} value={visitType}>
              {visitType === "NEW" ? "No — first visit" : "Yes — follow-up"}
            </option>
          ))}
        </Select>
      </Label>

      {/* Chief Complaint / Reason */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="reasonForVisit">
          Reason for Visit / Chief Complaint (Optional)
          <Input
            id="reasonForVisit"
            name="reasonForVisit"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Fever since 2 days, body ache"
          />
        </Label>
        
        <div className="flex flex-wrap gap-1.5 mt-1">
          {COMMON_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className="text-[11px] rounded-full border border-border bg-background px-2.5 py-1 text-muted hover:border-primary/50 hover:text-foreground transition-colors text-left"
            >
              + {r}
            </button>
          ))}
        </div>
      </div>

      <FormError>{state.error}</FormError>

      <div className="pt-2">
        <Button type="submit" disabled={pending} size="lg" className="w-full font-bold shadow-sm">
          {pending ? "Issuing Digital Serial..." : "Confirm & Issue Digital Token"}
        </Button>
        <p className="text-center text-[11px] text-muted mt-2">
          🔒 You will instantly receive a live queue tracking pass. No payment is charged now.
        </p>
      </div>
    </form>
  );
}
