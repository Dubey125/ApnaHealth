"use client";

import { useActionState } from "react";
import Link from "next/link";
import { patientLogin, type PatientAuthState } from "@/app/patient/actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: PatientAuthState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(patientLogin, initialState);

  return (
    <>
      <form action={formAction} className="flex flex-col gap-3">
        <Label htmlFor="phone">
          Phone number
          <Input id="phone" name="phone" type="tel" placeholder="10-digit mobile number" required />
        </Label>
        <Label htmlFor="password">
          Password
          <Input id="password" name="password" type="password" placeholder="Password" required />
        </Label>
        <FormError>{state.error}</FormError>
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-muted">
        No account yet?{" "}
        <Link href="/patient/register" className="font-medium text-primary underline underline-offset-2">
          Create one
        </Link>
      </p>
    </>
  );
}
