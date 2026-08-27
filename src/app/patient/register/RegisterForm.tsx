"use client";

import { useActionState } from "react";
import Link from "next/link";
import { patientRegister, type PatientAuthState } from "@/app/patient/actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: PatientAuthState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(patientRegister, initialState);

  return (
    <>
      <form action={formAction} className="flex flex-col gap-3">
        <Label htmlFor="name">
          Full name
          <Input id="name" name="name" type="text" placeholder="Full name" required />
        </Label>
        <Label htmlFor="phone">
          Phone number
          <Input id="phone" name="phone" type="tel" placeholder="10-digit mobile number" required />
        </Label>
        <Label htmlFor="email">
          Email (optional)
          <Input id="email" name="email" type="email" placeholder="you@example.com" />
        </Label>
        <Label htmlFor="password">
          Password
          <Input id="password" name="password" type="password" placeholder="8+ characters" required minLength={8} />
        </Label>
        <FormError>{state.error}</FormError>
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Creating account..." : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </>
  );
}
