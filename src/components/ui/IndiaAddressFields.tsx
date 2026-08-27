"use client";

import { useEffect, useState } from "react";
import { Input, Label } from "./Input";

// PIN-code driven address entry using India Post's public PIN API
// (api.postalpincode.in) — free, keyless and CORS-enabled, which is why it
// is preferred here over a geocoder that would need a billed API key.
//
// The lookup is an ACCELERATOR, never a gate: every field below stays a
// normal editable input, and the form submits identically if the API is
// slow, blocked, rate-limited or wrong about a locality. That matters —
// a doctor must never be unable to register because a third party is down.
//
// Locality uses a <datalist>, so it behaves as a true typeahead: the PIN's
// post offices are offered as suggestions while any other value can still
// be typed (new colonies routinely aren't in the postal list yet).

interface PostOffice {
  Name: string;
  District: string;
  State: string;
}

interface PincodeResponse {
  Status: string;
  PostOffice: PostOffice[] | null;
}

type LookupKind = "idle" | "loading" | "found" | "notFound" | "unavailable";

interface Lookup {
  /** The PIN this result describes, so a stale result is never displayed. */
  pin: string;
  kind: LookupKind;
  localities: string[];
}

const EMPTY: Lookup = { pin: "", kind: "idle", localities: [] };

export function IndiaAddressFields({
  addressName = "addressLine",
  areaName = "areaLabel",
  cityName = "city",
  stateName = "state",
  postalName = "postalCode",
  addressLabel = "Address",
  idPrefix = "addr",
}: {
  addressName?: string;
  areaName?: string;
  cityName?: string;
  stateName?: string;
  postalName?: string;
  addressLabel?: string;
  idPrefix?: string;
}) {
  const [pin, setPin] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [lookup, setLookup] = useState<Lookup>(EMPTY);

  const digits = pin.replace(/\D/g, "");
  const pinComplete = digits.length === 6;

  // Derived, not stored: while the PIN is incomplete this is "idle", and
  // while a complete PIN has no result yet it is "loading". Deriving
  // avoids a synchronous setState in the effect body (which would cause a
  // cascading re-render) and makes a stale result impossible to show,
  // since a Lookup is only used when its `pin` matches what's typed now.
  const status: LookupKind = !pinComplete ? "idle" : lookup.pin === digits ? lookup.kind : "loading";
  const localities = lookup.pin === digits ? lookup.localities : [];

  useEffect(() => {
    if (!pinComplete) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${digits}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: PincodeResponse[] = await res.json();
        const entry = json?.[0];
        const offices = entry?.Status === "Success" && entry.PostOffice ? entry.PostOffice : [];
        if (offices.length === 0) {
          setLookup({ pin: digits, kind: "notFound", localities: [] });
          return;
        }
        setLookup({ pin: digits, kind: "found", localities: [...new Set(offices.map((o) => o.Name))] });
        // District/State are consistent across a PIN's post offices, so
        // the first is authoritative. Only prefill — never clobber
        // something the user has already typed.
        setCity((prev) => prev || offices[0].District);
        setStateValue((prev) => prev || offices[0].State);
      } catch {
        if (controller.signal.aborted) return;
        // Offline, blocked, rate-limited or malformed — all the same to
        // the user: type it in yourself, nothing is blocked.
        setLookup({ pin: digits, kind: "unavailable", localities: [] });
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [digits, pinComplete]);

  const localityListId = `${idPrefix}-localities`;
  const hintIsWarning = status === "notFound" || status === "unavailable";

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={`${idPrefix}-line`}>
        {addressLabel}
        <Input
          id={`${idPrefix}-line`}
          name={addressName}
          required
          autoComplete="street-address"
          placeholder="Building, street"
        />
      </Label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label htmlFor={`${idPrefix}-pin`}>
          PIN code
          <Input
            id={`${idPrefix}-pin`}
            name={postalName}
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            placeholder="e.g. 411001"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <span className={hintIsWarning ? "text-xs text-warning" : "text-xs text-muted"} role="status" aria-live="polite">
            {status === "idle" && "Enter 6 digits to auto-fill city and state"}
            {status === "loading" && "Looking up PIN…"}
            {status === "found" &&
              `${localities.length} ${localities.length === 1 ? "locality" : "localities"} found — pick yours below`}
            {status === "notFound" && "No match for that PIN — enter the address manually"}
            {status === "unavailable" && "PIN lookup unavailable — enter the address manually"}
          </span>
        </Label>

        <Label htmlFor={`${idPrefix}-area`}>
          Area / locality
          <Input
            id={`${idPrefix}-area`}
            name={areaName}
            list={localityListId}
            autoComplete="address-level3"
            placeholder="e.g. Koregaon Park"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
          <datalist id={localityListId}>
            {localities.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label htmlFor={`${idPrefix}-city`}>
          City / district
          <Input
            id={`${idPrefix}-city`}
            name={cityName}
            required
            autoComplete="address-level2"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </Label>
        <Label htmlFor={`${idPrefix}-state`}>
          State
          <Input
            id={`${idPrefix}-state`}
            name={stateName}
            required
            autoComplete="address-level1"
            value={stateValue}
            onChange={(e) => setStateValue(e.target.value)}
          />
        </Label>
      </div>
    </div>
  );
}
