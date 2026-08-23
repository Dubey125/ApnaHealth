"use client";

import { useActionState } from "react";
import { updateClinic, type UpdateClinicState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: UpdateClinicState = {};

interface ClinicFormProps {
  clinic: {
    name: string;
    addressLine: string;
    city: string;
    state: string;
    postalCode: string | null;
    phone: string;
  };
}

export function ClinicForm({ clinic }: ClinicFormProps) {
  const [state, formAction, pending] = useActionState(updateClinic, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <Label htmlFor="clinic-name">
        Clinic name
        <Input id="clinic-name" name="name" required defaultValue={clinic.name} />
      </Label>
      <Label htmlFor="clinic-address">
        Address
        <Input id="clinic-address" name="addressLine" required defaultValue={clinic.addressLine} />
      </Label>
      <div className="grid gap-3 sm:grid-cols-3">
        <Label htmlFor="clinic-city">
          City
          <Input id="clinic-city" name="city" required defaultValue={clinic.city} />
        </Label>
        <Label htmlFor="clinic-state">
          State
          <Input id="clinic-state" name="state" required defaultValue={clinic.state} />
        </Label>
        <Label htmlFor="clinic-postal">
          Postal code (optional)
          <Input id="clinic-postal" name="postalCode" defaultValue={clinic.postalCode ?? ""} />
        </Label>
      </div>
      <Label htmlFor="clinic-phone">
        Phone
        <Input id="clinic-phone" name="phone" type="tel" required defaultValue={clinic.phone} />
      </Label>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
