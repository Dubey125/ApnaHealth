"use client";

import { useActionState, useState } from "react";
import { updateStaffUser } from "../actions";
import type { StaffFormState } from "../actions";
import { Input, Label, Select } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";
import type { StaffRole } from "@/generated/prisma/enums";

const initialState: StaffFormState = {};

interface UnlinkedDoctor {
  id: string;
  name: string;
}

interface StaffEditFormProps {
  staffUser: {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    doctorId: string | null;
  };
  unlinkedDoctors: UnlinkedDoctor[];
}

export function StaffEditForm({ staffUser, unlinkedDoctors }: StaffEditFormProps) {
  const [state, formAction, pending] = useActionState(updateStaffUser, initialState);
  const [role, setRole] = useState<StaffRole>(staffUser.role);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="staffUserId" value={staffUser.id} />
      <Label htmlFor="edit-staff-name">
        Name
        <Input id="edit-staff-name" name="name" required defaultValue={staffUser.name} />
      </Label>
      <Label htmlFor="edit-staff-email">
        Email
        <Input id="edit-staff-email" name="email" type="email" required defaultValue={staffUser.email} />
      </Label>
      <Label htmlFor="edit-staff-password">
        New password (optional)
        <Input id="edit-staff-password" name="password" type="password" placeholder="Leave blank to keep unchanged" minLength={8} />
      </Label>
      <Label htmlFor="edit-staff-role">
        Role
        <Select id="edit-staff-role" name="role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          <option value="FRONT_DESK">Front desk</option>
          <option value="DOCTOR">Doctor</option>
          <option value="OWNER">Owner</option>
        </Select>
      </Label>
      {role === "DOCTOR" && (
        <Label htmlFor="edit-staff-doctorId">
          Doctor profile
          <Select id="edit-staff-doctorId" name="doctorId" required defaultValue={staffUser.doctorId ?? ""}>
            <option value="" disabled>
              Select a doctor
            </option>
            {unlinkedDoctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Label>
      )}
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
