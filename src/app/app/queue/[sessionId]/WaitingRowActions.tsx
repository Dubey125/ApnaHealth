"use client";

import { useActionState, useState } from "react";
import { checkInToken, markNoShow, cancelTokenByStaff, type QueueActionState } from "./actions";
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

export function WaitingRowActions({
  sessionId,
  tokenId,
  tokenLabel,
  showCheckIn,
}: {
  sessionId: string;
  tokenId: string;
  tokenLabel: string;
  showCheckIn: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      {showCheckIn && <CheckInForm sessionId={sessionId} tokenId={tokenId} />}
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
