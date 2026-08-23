"use client";

import { useActionState } from "react";
import { createSession, type SessionFormState } from "./actions";
import { Input, Label, Select } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";

const initialState: SessionFormState = {};

interface SessionFormProps {
  // Omitted when a doctor is scheduling for themselves: the action takes
  // their doctorId from the session cookie and ignores any submitted
  // value, so there is nothing to pick.
  doctors?: { id: string; name: string }[];
  title?: string;
}

export function SessionForm({ doctors, title = "Create session" }: SessionFormProps) {
  const [state, formAction, pending] = useActionState(createSession, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {doctors && (
        <Label htmlFor="session-doctor">
          Doctor
          <Select id="session-doctor" name="doctorId" required>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Label>
      )}
      <Label htmlFor="session-date">
        Date
        <Input id="session-date" name="sessionDate" type="date" required />
      </Label>
      <div className="flex gap-3">
        <Label htmlFor="session-start" className="flex-1">
          Start time
          <Input id="session-start" name="plannedStartAt" type="time" required />
        </Label>
        <Label htmlFor="session-end" className="flex-1">
          End time
          <Input id="session-end" name="plannedEndAt" type="time" required />
        </Label>
      </div>
      <Label htmlFor="session-location">
        Location
        <Input id="session-location" name="locationLabel" required placeholder="e.g. Room 1" />
      </Label>
      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create session"}
      </Button>
    </form>
  );
}
