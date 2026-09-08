"use client";

import { useActionState, useState } from "react";
import { changeSubscriptionStatus, type AdminActionState } from "../actions";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/components/ui/FormError";
import { Select, Input, Label } from "@/components/ui/Input";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

const initialState: AdminActionState = {};

// Only the transitions the state machine actually permits are offered.
//
// The server rejects an illegal move regardless (canTransition is the
// boundary), but a dropdown that lists options the server will refuse is a
// UI that lies about what is possible.
const ALLOWED: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "SUSPENDED", "CANCELLED"],
  ACTIVE: ["PAST_DUE", "CANCELLED"],
  PAST_DUE: ["ACTIVE", "SUSPENDED", "CANCELLED"],
  SUSPENDED: ["ACTIVE", "CANCELLED"],
  CANCELLED: ["ACTIVE"],
};

const LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: "Trial",
  ACTIVE: "Mark paid / active",
  PAST_DUE: "Payment failed",
  SUSPENDED: "Suspend",
  CANCELLED: "Cancel",
};

export function SubscriptionControls({ clinicId, status }: { clinicId: string; status: SubscriptionStatus }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(changeSubscriptionStatus, initialState);
  const options = ALLOWED[status];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Change
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Change subscription">
        <p className="text-sm text-muted">
          This records a commercial decision. It does not take a payment, and it never affects patients already holding
          a token — they can be seen in any subscription state.
        </p>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="clinicId" value={clinicId} />
          <Label htmlFor={`status-${clinicId}`}>
            New status
            <Select id={`status-${clinicId}`} name="toStatus" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {LABEL[option]}
                </option>
              ))}
            </Select>
          </Label>
          <Label htmlFor={`plan-${clinicId}`}>
            Plan (when activating)
            <Select id={`plan-${clinicId}`} name="plan" defaultValue="">
              <option value="">Keep current</option>
              <option value="STARTER">STARTER</option>
              <option value="GROWTH">GROWTH</option>
            </Select>
          </Label>
          <Label htmlFor={`reason-${clinicId}`}>
            Reason
            <Input
              id={`reason-${clinicId}`}
              name="reason"
              required
              minLength={3}
              maxLength={200}
              placeholder="e.g. bank transfer received 2 Sept"
            />
          </Label>
          <FormError>{state.error}</FormError>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-border/40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Saving..." : "Record change"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
