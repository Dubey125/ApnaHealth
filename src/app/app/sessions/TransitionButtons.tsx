"use client";

import { useActionState } from "react";
import { transitionSession, type SessionFormState } from "./actions";
import { isValidSessionTransition } from "@/lib/queue/sessionTransitions";
import type { SessionStatus } from "@/generated/prisma/enums";
import { FormError } from "@/components/ui/FormError";

const ALL_STATUSES: SessionStatus[] = ["SCHEDULED", "OPEN", "IN_PROGRESS", "PAUSED", "CLOSED"];
const initialState: SessionFormState = {};

interface TransitionButtonsProps {
  sessionId: string;
  status: SessionStatus;
  returnTo: "/app/sessions" | "queue";
}

export function TransitionButtons({ sessionId, status, returnTo }: TransitionButtonsProps) {
  const [state, formAction, pending] = useActionState(transitionSession, initialState);
  const nextStatuses = ALL_STATUSES.filter((candidate) => isValidSessionTransition(status, candidate));

  if (nextStatuses.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        {nextStatuses.map((next) => (
          <form key={next} action={formAction}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="toStatus" value={next} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {next === "IN_PROGRESS" ? "Start" : next === "OPEN" ? "Open" : next === "PAUSED" ? "Pause" : next === "CLOSED" ? "Close" : next}
            </button>
          </form>
        ))}
      </div>
      <FormError>{state.error}</FormError>
    </div>
  );
}
