"use client";

import { useActionState, useState } from "react";
import { cancelMyAppointment, type CancelAppointmentState } from "./actions";
import { FormError } from "@/components/ui/FormError";

const initialState: CancelAppointmentState = {};

// Two-step, because cancelling is not reversible from here: re-booking
// means going back to the doctor's page and taking a new token, with a new
// number at the back of the queue. A single mis-tap in a list of
// appointments should not cost someone their place.
export function CancelAppointmentButton({ publicId, label }: { publicId: string; label: string }) {
  const [state, formAction, pending] = useActionState(cancelMyAppointment, initialState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-medium text-danger underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
      >
        Cancel
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="publicId" value={publicId} />
      <span className="text-sm text-foreground">Cancel {label}? You&apos;d need to book again to get a new one.</span>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md border border-danger/40 px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-sm font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Keep it
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
