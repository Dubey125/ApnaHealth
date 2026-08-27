"use client";

import { useActionState } from "react";
import { recordDoctorVerification, type AdminActionState } from "@/app/admin/actions";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: AdminActionState = {};

// Every field here exists so the record says what was actually checked and
// against what. registrationNumberChecked is typed by the reviewer rather
// than prefilled from the doctor's own submission on purpose: the point of
// the check is to confirm that number against a council, and pre-filling it
// invites confirming it against itself.
export function VerificationForm({ doctorId, claimedRegistrationNumber }: { doctorId: string; claimedRegistrationNumber: string | null }) {
  const [state, formAction, pending] = useActionState(recordDoctorVerification, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Record a verification check</h2>
      <input type="hidden" name="doctorId" value={doctorId} />

      <Label htmlFor="verify-status">
        Outcome
        <Select id="verify-status" name="status" required defaultValue="VERIFIED">
          <option value="VERIFIED">Verified — registration confirmed against the source</option>
          <option value="REJECTED">Rejected — could not be confirmed</option>
          <option value="PENDING">Back to unverified — needs more information</option>
        </Select>
      </Label>

      <Label htmlFor="verify-regnumber">
        Registration number you checked
        <Input id="verify-regnumber" name="registrationNumberChecked" required />
        <span className="text-xs text-muted">
          {claimedRegistrationNumber
            ? `The doctor submitted ${claimedRegistrationNumber}. Type what you actually looked up.`
            : "This doctor did not submit a registration number — get one before verifying."}
        </span>
      </Label>

      <Label htmlFor="verify-source">
        Source checked against
        <Input id="verify-source" name="sourceName" required placeholder="e.g. Maharashtra Medical Council portal" />
      </Label>
      <Label htmlFor="verify-sourceref">
        Source reference (optional)
        <Input id="verify-sourceref" name="sourceReference" placeholder="Search URL, reference number, screenshot ID" />
      </Label>
      <Label htmlFor="verify-notes">
        Notes (optional)
        <Textarea id="verify-notes" name="notes" />
      </Label>

      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Recording..." : "Record verification check"}
      </Button>
    </form>
  );
}
