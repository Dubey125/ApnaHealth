"use client";

import { useState } from "react";
import { Input, Label, Select } from "./Input";
import { SPECIALTY_GROUPS, OTHER_SPECIALTY } from "@/lib/specialties";

// Grouped <optgroup> select over the canonical specialty list, so the
// values stored in Doctor.specialty stay consistent — the public
// "browse by specialty" chips group on that exact column, and free text
// would split one specialty across several chips.
//
// Choosing "Other" reveals a free-text box and submits that instead, so an
// unlisted specialty is never forced into a wrong category.
export function SpecialtySelect({
  name = "specialty",
  id = "specialty",
  defaultValue = "",
  required = true,
}: {
  name?: string;
  id?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const known = SPECIALTY_GROUPS.some((g) => g.options.includes(defaultValue));
  const [choice, setChoice] = useState(defaultValue && !known ? OTHER_SPECIALTY : defaultValue);
  const [custom, setCustom] = useState(defaultValue && !known ? defaultValue : "");

  const isOther = choice === OTHER_SPECIALTY;
  const submitted = isOther ? custom.trim() : choice;

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={id}>
        Specialty
        <Select id={id} value={choice} onChange={(e) => setChoice(e.target.value)} required={required}>
          <option value="" disabled>
            Select a specialty
          </option>
          {SPECIALTY_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Label>

      {isOther && (
        <Label htmlFor={`${id}-other`}>
          Specify your specialty
          <Input
            id={`${id}-other`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            required={required}
            placeholder="Your specialty as it should appear to patients"
          />
        </Label>
      )}

      {/* Only the resolved value is submitted, so "Other" itself can never
          be stored as a specialty name. */}
      <input type="hidden" name={name} value={submitted} />
    </div>
  );
}
