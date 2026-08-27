"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <Label htmlFor="reset-password">
        New password
        <Input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          autoFocus
          required
        />
      </Label>
      <Label htmlFor="reset-confirm">
        Confirm new password
        <Input id="reset-confirm" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Label>
      <p className="text-xs text-muted">At least 8 characters.</p>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Saving..." : "Set new password"}
      </Button>
    </form>
  );
}
