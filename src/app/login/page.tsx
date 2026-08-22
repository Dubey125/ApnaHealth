"use client";

import { useActionState } from "react";
import { staffLogin, type StaffLoginState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: StaffLoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(staffLogin, initialState);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Staff login</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <Label htmlFor="staff-login-email">
          Email
          <Input id="staff-login-email" name="email" type="email" required />
        </Label>
        <Label htmlFor="staff-login-password">
          Password
          <Input id="staff-login-password" name="password" type="password" required />
        </Label>
        <FormError>{state.error}</FormError>
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
