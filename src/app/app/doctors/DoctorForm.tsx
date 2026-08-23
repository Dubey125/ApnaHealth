"use client";

import { useActionState } from "react";
import { createDoctor, type CreateDoctorState } from "./actions";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: CreateDoctorState = {};

export function DoctorForm() {
  const [state, formAction, pending] = useActionState(createDoctor, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Add a doctor</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label htmlFor="doctor-name">
          Name
          <Input id="doctor-name" name="name" required placeholder="Dr. Firstname Lastname" />
        </Label>
        <Label htmlFor="doctor-specialty">
          Specialty
          <Input id="doctor-specialty" name="specialty" required placeholder="e.g. Cardiologist" />
        </Label>
      </div>

      <Label htmlFor="doctor-qualification">
        Qualification
        <Input id="doctor-qualification" name="qualificationText" required placeholder="e.g. MBBS, MD" />
      </Label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label htmlFor="doctor-regnumber">
          Registration number (optional)
          <Input id="doctor-regnumber" name="registrationNumber" />
        </Label>
        <Label htmlFor="doctor-regcouncil">
          Registration council (optional)
          <Input id="doctor-regcouncil" name="registrationCouncil" placeholder="e.g. State Medical Council" />
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Label htmlFor="doctor-experience">
          Experience (years, optional)
          <Input id="doctor-experience" name="experienceYears" type="number" min={0} max={80} />
        </Label>
        <Label htmlFor="doctor-fee">
          Consultation fee ₹ (optional)
          <Input id="doctor-fee" name="consultationFeeRupees" type="number" min={0} step="1" />
        </Label>
        <Label htmlFor="doctor-consultminutes">
          Default consult length, min (optional)
          <Input id="doctor-consultminutes" name="defaultConsultMinutes" type="number" min={1} max={120} placeholder="6" />
        </Label>
      </div>

      <Label htmlFor="doctor-languages">
        Languages spoken (optional)
        <Input id="doctor-languages" name="languagesText" placeholder="e.g. English, Hindi" />
      </Label>

      <Label htmlFor="doctor-photourl">
        Photo URL (optional)
        <Input id="doctor-photourl" name="photoUrl" type="url" placeholder="https://..." />
      </Label>

      <Label htmlFor="doctor-bio">
        Bio (optional)
        <Textarea id="doctor-bio" name="bio" />
      </Label>

      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add doctor"}
      </Button>
      <p className="text-xs text-muted">
        New doctors start as unverified — record a verification check from their profile so the verified badge shows
        on their public listing.
      </p>
    </form>
  );
}
