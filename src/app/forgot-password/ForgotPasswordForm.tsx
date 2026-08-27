"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">
          <strong className="font-medium">Check your email.</strong> If that address has an ApnaHealth account, a reset
          link is on its way. It works once and expires in an hour.
        </Alert>
        <Link href="/login" className="text-sm font-medium text-primary underline underline-offset-2">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="forgot-identifier">
        Email or phone number
        <Input
          id="forgot-identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoFocus
          required
          placeholder="you@example.com or 98765 43210"
        />
      </Label>
      <p className="text-xs text-muted">
        The reset link is sent by email, so your account needs an email address on it. Patients who signed up with a
        phone number only can add one under{" "}
        <Link href="/patient/account" className="underline underline-offset-2">
          your details
        </Link>{" "}
        while still signed in.
      </p>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
