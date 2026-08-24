"use client";

import { useActionState } from "react";
import { registerDoctor, type RegisterState } from "../actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: RegisterState = {};

export function RegisterDoctorForm() {
  const [state, formAction, pending] = useActionState(registerDoctor, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">About you</div>
        <Label htmlFor="rd-name">
          Full name
          <Input id="rd-name" name="doctorName" required placeholder="Dr. Firstname Lastname" />
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="rd-specialty">
            Specialty
            <Input id="rd-specialty" name="specialty" required placeholder="e.g. General Physician" />
          </Label>
          <Label htmlFor="rd-qual">
            Qualification
            <Input id="rd-qual" name="qualificationText" required placeholder="e.g. MBBS, MD" />
          </Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="rd-regnum">
            Medical registration number
            <Input id="rd-regnum" name="registrationNumber" />
          </Label>
          <Label htmlFor="rd-council">
            Registration council
            <Input id="rd-council" name="registrationCouncil" placeholder="e.g. Maharashtra Medical Council" />
          </Label>
        </div>
        <Label htmlFor="rd-docphone">
          Contact number shown on your profile
          <Input id="rd-docphone" name="doctorPhone" type="tel" />
        </Label>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Where you practise</div>
        <Label htmlFor="rd-practice">
          Practice / clinic name
          <Input id="rd-practice" name="practiceName" required placeholder="e.g. Dr. Sharma's Clinic" />
        </Label>
        <Label htmlFor="rd-address">
          Address
          <Input id="rd-address" name="addressLine" required />
        </Label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label htmlFor="rd-area">
            Area / locality
            <Input id="rd-area" name="areaLabel" placeholder="e.g. Koregaon Park" />
          </Label>
          <Label htmlFor="rd-city">
            City
            <Input id="rd-city" name="city" required />
          </Label>
          <Label htmlFor="rd-state">
            State
            <Input id="rd-state" name="state" required />
          </Label>
        </div>
        <Label htmlFor="rd-phone">
          Practice phone
          <Input id="rd-phone" name="phone" type="tel" required />
        </Label>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Sign-in details</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="rd-email">
            Email
            <Input id="rd-email" name="email" type="email" required autoComplete="email" />
          </Label>
          <Label htmlFor="rd-password">
            Password
            <Input
              id="rd-password"
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
        {pending ? "Setting up your practice..." : "Create doctor account"}
      </Button>
      <p className="text-xs text-muted">
        Your profile is listed as <strong className="font-medium text-foreground">unverified</strong> until a
        registration check is recorded against an official source. ApnaHealth never marks a doctor verified
        automatically.
      </p>
    </form>
  );
}
