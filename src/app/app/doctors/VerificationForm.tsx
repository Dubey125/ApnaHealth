"use client";

import { useActionState } from "react";
import { recordDoctorVerification, type VerifyDoctorState } from "./actions";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: VerifyDoctorState = {};

export function VerificationForm({ doctorId }: { doctorId: string }) {
  const [state, formAction, pending] = useActionState(recordDoctorVerification, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Record a verification check</h2>
      <input type="hidden" name="doctorId" value={doctorId} />
      <Label htmlFor="verify-status">
        Status
        <Select id="verify-status" name="status" required defaultValue="VERIFIED">
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
          <option value="PENDING">Pending</option>
        </Select>
      </Label>
      <Label htmlFor="verify-regnumber">
        Registration number checked
        <Input id="verify-regnumber" name="registrationNumberChecked" required />
      </Label>
      <Label htmlFor="verify-source">
        Source checked against
        <Input id="verify-source" name="sourceName" required placeholder="e.g. State Medical Council portal" />
      </Label>
      <Label htmlFor="verify-sourceref">
        Source reference (optional)
        <Input id="verify-sourceref" name="sourceReference" />
      </Label>
      <Label htmlFor="verify-notes">
        Notes (optional)
        <Textarea id="verify-notes" name="notes" />
      </Label>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>
        {pending ? "Recording..." : "Record verification check"}
      </Button>
    </form>
  );
}
