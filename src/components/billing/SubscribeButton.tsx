"use client";

import { useActionState, useState } from "react";
import { startSubscription, cancelOwnSubscription, type BillingActionState } from "@/app/app/billing/actions";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/components/ui/FormError";

const initialState: BillingActionState = {};

export function SubscribeButton({ priceLabel, trialDays }: { priceLabel: string; trialDays: number }) {
  const [state, formAction, pending] = useActionState(startSubscription, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Opening payment…" : `Subscribe — ${priceLabel}/month`}
      </button>
      {/* Said before the click, not after. A trial that bills you on day
          one because nobody mentioned the mandate is how a clinic stops
          trusting a supplier. */}
      <p className="text-xs text-muted">
        You&apos;ll be taken to Razorpay to authorise the payment. Nothing is charged until your {trialDays}-day free
        trial ends, and you can cancel before then at no cost.
      </p>
      <FormError>{state.error}</FormError>
    </form>
  );
}

export function CancelSubscriptionButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(cancelOwnSubscription, initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted underline underline-offset-2 hover:text-foreground"
      >
        Cancel subscription
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel your subscription?">
        <div className="flex flex-col gap-2 text-sm text-muted">
          <p>
            You keep full access until the end of the period you have already paid for — cancelling does not cut you
            off today.
          </p>
          <p className="font-medium text-foreground">
            Patients already holding a token can always be seen, in any subscription state. Cancelling will never strand
            someone in your waiting room.
          </p>
          <p>After the period ends, you can still run existing queues but cannot issue new tokens or take bookings.</p>
        </div>
        <form action={formAction} className="flex flex-col gap-2">
          <FormError>{state.error}</FormError>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-border/40"
            >
              Keep my plan
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-danger px-3 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Working…" : "Cancel at period end"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
