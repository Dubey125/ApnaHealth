"use client";

import { useActionState } from "react";
import { selfBookToken, type BookingState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: BookingState = {};

export function BookingForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(selfBookToken, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Label htmlFor="patientName">
        Your name
        <Input id="patientName" name="patientName" placeholder="Full name" required />
      </Label>
      <Label htmlFor="patientPhone">
        Phone number
        <Input id="patientPhone" name="patientPhone" type="tel" placeholder="10-digit mobile number" required />
      </Label>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Booking..." : "Book a token"}
      </Button>
    </form>
  );
}
