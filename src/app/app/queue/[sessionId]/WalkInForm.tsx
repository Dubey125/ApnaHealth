"use client";

import { useActionState } from "react";
import { issueWalkInToken, type QueueActionState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: QueueActionState = {};

export function WalkInForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(issueWalkInToken, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Walk-in</h2>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Label htmlFor="walkin-name">
        Name
        <Input id="walkin-name" name="patientName" required />
      </Label>
      <Label htmlFor="walkin-phone">
        Phone
        <Input id="walkin-phone" name="patientPhone" type="tel" required />
      </Label>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Issuing..." : "Issue walk-in token"}
      </Button>
    </form>
  );
}
