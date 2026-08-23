"use client";

import { useActionState } from "react";
import { toggleStaffActive } from "../actions";
import type { StaffFormState } from "../actions";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: StaffFormState = {};

export function DeactivateForm({ staffUserId, isActive }: { staffUserId: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(toggleStaffActive, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="staffUserId" value={staffUserId} />
      <input type="hidden" name="makeActive" value={isActive ? "false" : "true"} />
      <p className="text-sm text-muted">
        {isActive
          ? "Deactivating this account blocks future sign-ins. Its history (audit log, verifications, queue actions) stays intact."
          : "This account is inactive and cannot sign in. Reactivating restores sign-in access."}
      </p>
      <FormError>{state.error}</FormError>
      <Button type="submit" variant={isActive ? "danger" : "secondary"} disabled={pending} className="sm:self-start">
        {pending ? "Saving..." : isActive ? "Deactivate account" : "Reactivate account"}
      </Button>
    </form>
  );
}
