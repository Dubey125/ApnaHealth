"use client";

import { useActionState } from "react";
import { registerFacility, type RegisterState } from "../actions";
import { Input, Label, Select } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { IndiaAddressFields } from "@/components/ui/IndiaAddressFields";

const initialState: RegisterState = {};

export function RegisterFacilityForm() {
  const [state, formAction, pending] = useActionState(registerFacility, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">About the facility</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Label htmlFor="reg-facility-name">
            Facility name
            <Input id="reg-facility-name" name="facilityName" required placeholder="e.g. Sunrise Multispeciality" />
          </Label>
          <Label htmlFor="reg-facility-type">
            Type
            <Select id="reg-facility-type" name="facilityType" defaultValue="CLINIC">
              <option value="CLINIC">Clinic</option>
              <option value="HOSPITAL">Hospital</option>
            </Select>
          </Label>
        </div>

        <IndiaAddressFields idPrefix="reg" />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Reception phone</span>
          <PhoneInput name="phone" id="reg-phone" required placeholder="20 1234 5678" />
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Your administrator account</div>
        <Label htmlFor="reg-contact">
          Your name
          <Input id="reg-contact" name="contactName" required />
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="reg-email">
            Work email
            <Input id="reg-email" name="email" type="email" required autoComplete="email" />
          </Label>
          <Label htmlFor="reg-password">
            Password
            <Input
              id="reg-password"
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              placeholder="8+ characters"
            />
          </Label>
        </div>
      </div>

      <FormError>{state.error}</FormError>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating your workspace..." : "Create facility account"}
      </Button>
      <p className="text-xs text-muted">
        You&apos;ll be signed in as the owner and can add doctors, staff and sessions straight away. Doctors you add
        stay unverified until your team records a registration check against an official source.
      </p>
    </form>
  );
}
