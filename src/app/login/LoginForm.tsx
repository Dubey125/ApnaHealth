"use client";

import { useActionState } from "react";
import Link from "next/link";
import { staffLogin, type StaffLoginState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: StaffLoginState = {};

// One box, not a role picker. The visitor knows their email or phone and
// their password; which of the three account tables that lands in is the
// system's problem, not theirs — and asking "are you a doctor, a clinic, an
// admin or a patient?" before authenticating also tells an anonymous
// visitor which roles exist and hands them a smaller haystack to attack.
export function LoginForm() {
  const [state, formAction, pending] = useActionState(staffLogin, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="login-identifier">
        Email or phone number
        <Input
          id="login-identifier"
          name="identifier"
          // Deliberately not type="email": patients sign in with a phone
          // number, and the browser would reject it before submission.
          type="text"
          inputMode="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="you@example.com or 98765 43210"
        />
      </Label>
      <Label htmlFor="login-password">
        Password
        <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
      </Label>
      <div className="-mt-1 flex justify-end">
        <Link href="/forgot-password" className="text-sm text-muted underline underline-offset-2 hover:text-foreground">
          Forgot password?
        </Link>
      </div>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
