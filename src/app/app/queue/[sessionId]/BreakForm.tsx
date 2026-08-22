"use client";

import { useActionState } from "react";
import { createSessionBreak, type QueueActionState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: QueueActionState = {};

export function BreakForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(createSessionBreak, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Add a scheduled break</h2>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Label htmlFor="break-start">
        Break starts
        <Input id="break-start" name="startAt" type="datetime-local" required />
      </Label>
      <Label htmlFor="break-end">
        Break ends
        <Input id="break-end" name="endAt" type="datetime-local" required />
      </Label>
      <Label htmlFor="break-reason">
        Reason
        <Input id="break-reason" name="reason" placeholder="e.g. Lunch" required />
      </Label>
      <FormError>{state.error}</FormError>
      <Button type="submit" variant="secondary" disabled={pending} className="w-full">
        {pending ? "Adding..." : "Add break"}
      </Button>
    </form>
  );
}
