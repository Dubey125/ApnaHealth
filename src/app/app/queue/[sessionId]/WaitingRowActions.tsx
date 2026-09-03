"use client";

import { useActionState, useState } from "react";
import {
  checkInToken,
  markNoShow,
  cancelTokenByStaff,
  prioritiseToken,
  restoreTokenOrder,
  type QueueActionState,
} from "./actions";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/components/ui/FormError";

const initialState: QueueActionState = {};

function CheckInForm({ sessionId, tokenId }: { sessionId: string; tokenId: string }) {
  const [state, formAction, pending] = useActionState(checkInToken, initialState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "..." : "Check in"}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  );
}

// No-show and Cancel are destructive (they remove the token from the
// active queue with no undo) and previously fired instantly on click —
// DESIGN_SYSTEM.md flagged this as a gap Dialog exists to close (PHASE-16).
// Each gets its own Dialog + useActionState pair rather than one shared
// dialog with a dynamic action, so the Rules of Hooks stay satisfied
// without conditional hook calls.
function ConfirmedAction({
  sessionId,
  tokenId,
  tokenLabel,
  label,
  confirmTitle,
  confirmBody,
  action,
}: {
  sessionId: string;
  tokenId: string;
  tokenLabel: string;
  label: string;
  confirmTitle: string;
  confirmBody: string;
  action: (state: QueueActionState, formData: FormData) => Promise<QueueActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center rounded-md border border-danger/40 px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
      >
        {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={confirmTitle}>
        <p className="text-sm text-muted">
          {confirmBody} <span className="font-medium text-foreground">{tokenLabel}</span>. This can&apos;t be undone.
        </p>
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="tokenId" value={tokenId} />
          <FormError>{state.error}</FormError>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-border/40"
            >
              Keep waiting
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-danger px-3 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Working..." : `Yes, ${label.toLowerCase()}`}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// Moving a patient forward. The reason box is required and the form
// cannot be submitted without it — not as a formality, but because this
// action pushes every other waiting patient back, and the person who
// benefits is standing at the counter while the people who lose out are
// sitting down. The clinic should be able to say afterwards why.
//
// Nothing here is automatic. There is no urgency score and no rule that
// promotes anyone: a human looks at a patient and decides.
function PrioritiseAction({ sessionId, tokenId, tokenLabel }: { sessionId: string; tokenId: string; tokenLabel: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(prioritiseToken, initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        See next
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Move this patient forward?">
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{tokenLabel}</span> will be called next. Everyone else waiting
          moves back one place, and their estimated times update.
        </p>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="tokenId" value={tokenId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Reason</span>
            <input
              name="reason"
              required
              minLength={3}
              maxLength={200}
              autoFocus
              placeholder="e.g. elderly patient, waiting 90 minutes"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span className="text-xs text-muted">Recorded with your name in the queue log. Patients never see this.</span>
          </label>
          <FormError>{state.error}</FormError>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-border/40"
            >
              Keep order
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Working..." : "Move forward"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// Undo. One click, no reason required — a counter that has just bumped
// the wrong patient should be able to put the queue back immediately.
// Who did it and when are still recorded.
function RestoreOrderAction({ sessionId, tokenId }: { sessionId: string; tokenId: string }) {
  const [state, formAction, pending] = useActionState(restoreTokenOrder, initialState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-muted transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "..." : "Undo move"}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  );
}

export function WaitingRowActions({
  sessionId,
  tokenId,
  tokenLabel,
  showCheckIn,
  canPrioritise = false,
  isPrioritised = false,
}: {
  sessionId: string;
  tokenId: string;
  tokenLabel: string;
  showCheckIn: boolean;
  /** Only a checked-in patient who isn't already first can be moved up. */
  canPrioritise?: boolean;
  isPrioritised?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      {showCheckIn && <CheckInForm sessionId={sessionId} tokenId={tokenId} />}
      {isPrioritised ? (
        <RestoreOrderAction sessionId={sessionId} tokenId={tokenId} />
      ) : (
        canPrioritise && <PrioritiseAction sessionId={sessionId} tokenId={tokenId} tokenLabel={tokenLabel} />
      )}
      <ConfirmedAction
        sessionId={sessionId}
        tokenId={tokenId}
        tokenLabel={tokenLabel}
        label="No-show"
        confirmTitle="Mark as no-show?"
        confirmBody="This will mark"
        action={markNoShow}
      />
      <ConfirmedAction
        sessionId={sessionId}
        tokenId={tokenId}
        tokenLabel={tokenLabel}
        label="Cancel"
        confirmTitle="Cancel this token?"
        confirmBody="This will cancel"
        action={cancelTokenByStaff}
      />
    </div>
  );
}
