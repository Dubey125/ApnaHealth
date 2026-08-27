"use client";

import { useActionState } from "react";
import { updatePatientContact, type UpdateContactState } from "@/app/patient/actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const initialState: UpdateContactState = {};

export function ContactForm({ name, email, phone }: { name: string; email: string | null; phone: string }) {
  const [state, formAction, pending] = useActionState(updatePatientContact, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Your details</h2>

      <Label htmlFor="account-name">
        Full name
        <Input id="account-name" name="name" required defaultValue={name} />
      </Label>

      <Label htmlFor="account-email">
        Email address
        <Input id="account-email" name="email" type="email" defaultValue={email ?? ""} placeholder="you@example.com" />
      </Label>

      {!email && (
        <Alert variant="warning">
          You signed up with a phone number only. Add an email so you can reset your password if you forget it — it&apos;s
          the only way we can send you a reset link.
        </Alert>
      )}

      <p className="text-xs text-muted">
        Phone number: {phone}. To change it, ask the clinic front desk — your appointments and records are linked to it.
      </p>

      <FormError>{state.error}</FormError>
      {state.saved && <Alert variant="success">Saved.</Alert>}
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Saving..." : "Save details"}
      </Button>
    </form>
  );
}
