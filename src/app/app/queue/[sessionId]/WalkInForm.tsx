"use client";

import { useActionState } from "react";
import { issueWalkInToken, type QueueActionState } from "./actions";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: QueueActionState = {};

// Offline / counter booking. Name and phone are required (they identify
// the visit and opportunistically link an existing Patient account by
// phone); age, sex and reason are optional by design — the front desk
// must never be blocked from issuing a token because a detail is missing,
// but when they do capture it the doctor sees real context instead of a
// bare name.
export function WalkInForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(issueWalkInToken, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Walk-in / counter booking</h2>
      <input type="hidden" name="sessionId" value={sessionId} />

      <Label htmlFor="walkin-name">
        Patient name
        <Input id="walkin-name" name="patientName" required autoComplete="off" />
      </Label>
      <Label htmlFor="walkin-phone">
        Phone
        <Input id="walkin-phone" name="patientPhone" type="tel" required autoComplete="off" />
      </Label>

      <div className="grid grid-cols-2 gap-3">
        <Label htmlFor="walkin-age">
          Age
          <Input id="walkin-age" name="patientAge" type="number" min={0} max={130} inputMode="numeric" />
        </Label>
        <Label htmlFor="walkin-sex">
          Sex
          <Select id="walkin-sex" name="patientSex" defaultValue="">
            <option value="">Not recorded</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </Select>
        </Label>
      </div>

      <Label htmlFor="walkin-reason">
        Reason for visit
        <Textarea id="walkin-reason" name="reasonForVisit" rows={2} placeholder="e.g. fever since Monday" />
      </Label>

      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Issuing..." : "Issue walk-in token"}
      </Button>
    </form>
  );
}
