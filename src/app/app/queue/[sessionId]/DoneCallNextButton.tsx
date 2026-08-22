"use client";

import { useActionState, useEffect, useRef } from "react";
import { doneCallNext, type QueueActionState } from "./actions";
import { FormError } from "@/components/ui/FormError";

const initialState: QueueActionState = {};
const SHORTCUT_KEY = "n";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function DoneCallNextButton({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(doneCallNext, initialState);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // "N" triggers the single most-used front-desk action without reaching
  // for a mouse — ignored while typing in a form field (walk-in name/phone,
  // break reason, etc.) so it never hijacks normal text entry. Mouse/touch
  // still works identically; this is purely additive (PHASE-16).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== SHORTCUT_KEY) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      buttonRef.current?.click();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <button
        ref={buttonRef}
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary py-6 text-xl font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Working..." : "Done — call next"}
      </button>
      <p className="text-center text-xs text-muted">
        Press <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono">N</kbd> to do this from the keyboard
      </p>
      <FormError>{state.error}</FormError>
    </form>
  );
}
