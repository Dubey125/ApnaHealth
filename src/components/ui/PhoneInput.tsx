"use client";

import { useId, useState } from "react";
import { COUNTRY_CODES, DEFAULT_DIAL_CODE } from "@/lib/countryCodes";

// Country code + national number, submitted as a single "+91 2012345678"
// string under `name` so the server action and the Clinic.phone /
// Doctor.phone columns stay plain strings — no schema change, and any
// number already stored keeps rendering as-is.
//
// Defaults to India. The visible number box is not itself named; only the
// combined hidden field is submitted, so a half-typed number can never be
// saved without its dial code.
//
// Styled as ONE control rather than two adjacent fields: the shared
// Input/Select primitives both carry `w-full` (and cn() is a plain class
// joiner, not tailwind-merge, so a later `w-*` can't override it) — pairing
// them in a flex row made the select claim the whole row and squeeze the
// number box to a sliver. A dial code and a phone number are a single
// value anyway, so the border, background and focus ring belong to the
// group: focus-within lifts the ring for whichever half has focus, and the
// two inner controls are deliberately transparent and border-less.
export function PhoneInput({
  name,
  id,
  required = false,
  defaultDial = DEFAULT_DIAL_CODE,
  defaultNumber = "",
  placeholder = "98765 43210",
}: {
  name: string;
  id?: string;
  required?: boolean;
  defaultDial?: string;
  defaultNumber?: string;
  placeholder?: string;
}) {
  const reactId = useId();
  const fieldId = id ?? `phone-${reactId}`;
  const [dial, setDial] = useState(defaultDial);
  const [number, setNumber] = useState(defaultNumber);

  const trimmed = number.trim();
  const combined = trimmed ? `${dial} ${trimmed}` : "";

  return (
    <div className="flex h-11 w-full items-stretch rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-primary">
      <select
        aria-label="Country dial code"
        value={dial}
        onChange={(e) => setDial(e.target.value)}
        // Fixed width: a native select otherwise sizes itself to its widest
        // option, and one of 131 country names would set the width of every
        // phone field in the app.
        className="w-[5.75rem] shrink-0 cursor-pointer rounded-l-md bg-transparent pl-3 pr-1 text-sm text-foreground focus:outline-none"
      >
        {COUNTRY_CODES.map((c) => (
          // Value is the dial code, but several countries share one (+1,
          // +7), so the option key must be the ISO code.
          <option key={c.iso} value={c.dial} className="bg-surface text-foreground">
            {c.iso} {c.dial}
          </option>
        ))}
      </select>
      {/* Hairline divider, inset from the group's own border. */}
      <span aria-hidden="true" className="my-2 w-px shrink-0 bg-border" />
      <input
        id={fieldId}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        required={required}
        // min-w-0 is what actually lets this shrink inside the flex row;
        // without it the input's intrinsic size would push the group wide.
        className="min-w-0 flex-1 rounded-r-md bg-transparent px-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
      />
      <input type="hidden" name={name} value={combined} />
    </div>
  );
}
