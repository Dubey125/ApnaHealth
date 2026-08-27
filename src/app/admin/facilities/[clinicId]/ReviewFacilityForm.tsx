"use client";

import { useActionState, useState } from "react";
import { reviewFacility, type AdminActionState } from "@/app/admin/actions";
import { Label, Textarea } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

const initialState: AdminActionState = {};

type Decision = "APPROVED" | "REJECTED";

// The decision is a pair of radio buttons rather than two submit buttons,
// because rejecting requires a reason and the form has to be able to say so
// before it is submitted — a reviewer who clicks "Reject" and gets bounced
// back by a server error has already lost the note they were about to type.
export function ReviewFacilityForm({
  clinicId,
  currentStatus,
}: {
  clinicId: string;
  currentStatus: "PENDING" | "APPROVED" | "REJECTED";
}) {
  const [state, formAction, pending] = useActionState(reviewFacility, initialState);
  const [decision, setDecision] = useState<Decision>(currentStatus === "REJECTED" ? "REJECTED" : "APPROVED");

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">
        {currentStatus === "PENDING" ? "Record your decision" : "Change this decision"}
      </h2>
      <input type="hidden" name="clinicId" value={clinicId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Decision</legend>
        <div className="flex flex-wrap gap-2">
          {(["APPROVED", "REJECTED"] as const).map((value) => (
            <label
              key={value}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                decision === value
                  ? value === "APPROVED"
                    ? "border-success bg-success/10 text-success"
                    : "border-danger bg-danger/10 text-danger"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="decision"
                value={value}
                checked={decision === value}
                onChange={() => setDecision(value)}
                className="accent-current"
              />
              {value === "APPROVED" ? "Approve and list publicly" : "Reject"}
            </label>
          ))}
        </div>
      </fieldset>

      <Label htmlFor="review-notes">
        {decision === "REJECTED" ? "Reason for rejection" : "Reviewer note (optional)"}
        <Textarea
          id="review-notes"
          name="notes"
          required={decision === "REJECTED"}
          placeholder={
            decision === "REJECTED"
              ? "What the facility needs to correct before resubmitting"
              : "What you checked, and against what"
          }
        />
      </Label>
      <p className="text-xs text-muted">
        {decision === "REJECTED"
          ? "Shown to the facility on their dashboard so they can correct it. Their account stays active."
          : "Approving lists this facility and its doctors in patient search. It does not verify any doctor's medical registration — that is a separate check per doctor."}
      </p>

      <FormError>{state.error}</FormError>
      <Button type="submit" variant={decision === "REJECTED" ? "danger" : "primary"} disabled={pending} className="sm:self-start">
        {pending ? "Saving..." : decision === "REJECTED" ? "Reject facility" : "Approve facility"}
      </Button>
    </form>
  );
}
