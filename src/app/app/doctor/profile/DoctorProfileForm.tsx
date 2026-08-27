"use client";

import { useActionState } from "react";
import { updateDoctorProfile, type UpdateDoctorProfileState } from "./actions";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";
import { PhoneInput } from "@/components/ui/PhoneInput";

const initialState: UpdateDoctorProfileState = {};

interface DoctorProfileFormProps {
  doctor: {
    qualificationText: string;
    experienceYears: number | null;
    languagesText: string | null;
    consultationFeeMinor: number | null;
    defaultConsultMinutes: number;
    bio: string | null;
    photoUrl: string | null;
    phone: string | null;
    email: string | null;
  };
}

export function DoctorProfileForm({ doctor }: DoctorProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateDoctorProfile, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <Label htmlFor="profile-qualification">
        Qualification
        <Input id="profile-qualification" name="qualificationText" required defaultValue={doctor.qualificationText} />
      </Label>

      <div className="grid gap-3 sm:grid-cols-3">
        <Label htmlFor="profile-experience">
          Experience (years)
          <Input
            id="profile-experience"
            name="experienceYears"
            type="number"
            min={0}
            max={80}
            defaultValue={doctor.experienceYears ?? ""}
          />
        </Label>
        <Label htmlFor="profile-fee">
          Consultation fee ₹
          <Input
            id="profile-fee"
            name="consultationFeeRupees"
            type="number"
            min={0}
            step="1"
            defaultValue={doctor.consultationFeeMinor != null ? doctor.consultationFeeMinor / 100 : ""}
          />
        </Label>
        <Label htmlFor="profile-consultminutes">
          Default consult length, min
          <Input
            id="profile-consultminutes"
            name="defaultConsultMinutes"
            type="number"
            min={1}
            max={120}
            defaultValue={doctor.defaultConsultMinutes}
          />
        </Label>
      </div>

      <Label htmlFor="profile-languages">
        Languages spoken
        <Input id="profile-languages" name="languagesText" defaultValue={doctor.languagesText ?? ""} placeholder="e.g. English, Hindi" />
      </Label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Contact number</span>
          <PhoneInput name="phone" id="profile-phone" defaultNumber={doctor.phone ?? ""} placeholder="98765 43210" />
        </div>
        <Label htmlFor="profile-email">
          Contact email
          <Input id="profile-email" name="email" type="email" defaultValue={doctor.email ?? ""} />
        </Label>
      </div>

      <Label htmlFor="profile-photourl">
        Photo URL
        <Input id="profile-photourl" name="photoUrl" type="url" defaultValue={doctor.photoUrl ?? ""} placeholder="https://..." />
      </Label>

      <Label htmlFor="profile-bio">
        Bio
        <Textarea id="profile-bio" name="bio" defaultValue={doctor.bio ?? ""} />
      </Label>

      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
