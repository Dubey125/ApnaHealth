"use client";

import { useActionState, useState } from "react";
import { createStaffUser, type StaffFormState } from "./actions";
import { Input, Label, Select } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";
import type { StaffRole } from "@/generated/prisma/enums";

const initialState: StaffFormState = {};

interface UnlinkedDoctor {
  id: string;
  name: string;
}

export function StaffForm({ unlinkedDoctors }: { unlinkedDoctors: UnlinkedDoctor[] }) {
  const [state, formAction, pending] = useActionState(createStaffUser, initialState);
  const [role, setRole] = useState<StaffRole>("FRONT_DESK");

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Add staff account</h2>
      <Label htmlFor="staff-name">
        Name
        <Input id="staff-name" name="name" required />
      </Label>
      <Label htmlFor="staff-email">
        Email
        <Input id="staff-email" name="email" type="email" required />
      </Label>
      <Label htmlFor="staff-password">
        Password
        <Input id="staff-password" name="password" type="password" placeholder="8+ characters" minLength={8} required />
      </Label>
      <Label htmlFor="staff-role">
        Role
        <Select id="staff-role" name="role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          <option value="FRONT_DESK">Front desk</option>
          <option value="DOCTOR">Doctor</option>
          <option value="OWNER">Owner</option>
        </Select>
      </Label>
      {role === "DOCTOR" && (
        <Label htmlFor="staff-doctorId">
          Doctor profile
          <Select id="staff-doctorId" name="doctorId" required defaultValue="">
            <option value="" disabled>
              Select a doctor
            </option>
            {unlinkedDoctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
          {unlinkedDoctors.length === 0 && (
            <span className="text-xs text-muted">Every doctor profile already has a linked staff account.</span>
          )}
        </Label>
      )}
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create staff account"}
      </Button>
    </form>
  );
}
