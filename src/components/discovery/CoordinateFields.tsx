"use client";

import { useState } from "react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// Facility coordinates, entered by the staff who run the facility.
//
// This is the supply side of "search near you": a facility with no
// coordinates is still listed and still searchable by name, specialty and
// city — it simply cannot appear in a radius search, because there is no
// honest distance to show for it.
//
// "Use my current location" is offered because the person filling this in
// is usually sitting at the facility, which makes their device the most
// accurate geocoder available without adding a paid API. It fills the two
// inputs and nothing more — the value stays visible, editable, and is only
// saved when the form is submitted.

interface CoordinateFieldsProps {
  latitude: number | null;
  longitude: number | null;
  latitudeName?: string;
  longitudeName?: string;
  idPrefix?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "filled"; accuracyMetres: number | null }
  | { kind: "error"; message: string };

export function CoordinateFields({
  latitude,
  longitude,
  latitudeName = "latitude",
  longitudeName = "longitude",
  idPrefix = "clinic",
}: CoordinateFieldsProps) {
  const [values, setValues] = useState({
    latitude: latitude?.toString() ?? "",
    longitude: longitude?.toString() ?? "",
  });
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus({ kind: "error", message: "This browser does not support location. Enter the coordinates manually." });
      return;
    }
    setStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Facility coordinates are a fixed, published property of a
        // building, so they are stored at full precision — unlike a
        // patient's position, which is coarsened before it is ever sent.
        setValues({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        });
        setStatus({
          kind: "filled",
          accuracyMetres: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
        });
      },
      (error) => {
        setStatus({
          kind: "error",
          message:
            error.code === error.PERMISSION_DENIED
              ? "Location access was blocked. Enter the coordinates manually, or allow access and try again."
              : "Could not read a location from this device. Enter the coordinates manually.",
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Map location (optional)</span>
          <span className="text-xs text-muted">
            Needed for patients searching &ldquo;near me&rdquo;. Without it this facility still appears in name,
            specialty and city searches.
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={useCurrentLocation}
          disabled={status.kind === "locating"}
        >
          {status.kind === "locating" ? "Reading…" : "Use my current location"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Label htmlFor={`${idPrefix}-latitude`}>
          Latitude
          <Input
            id={`${idPrefix}-latitude`}
            name={latitudeName}
            inputMode="decimal"
            placeholder="18.536"
            value={values.latitude}
            onChange={(event) => setValues((current) => ({ ...current, latitude: event.target.value }))}
          />
        </Label>
        <Label htmlFor={`${idPrefix}-longitude`}>
          Longitude
          <Input
            id={`${idPrefix}-longitude`}
            name={longitudeName}
            inputMode="decimal"
            placeholder="73.893"
            value={values.longitude}
            onChange={(event) => setValues((current) => ({ ...current, longitude: event.target.value }))}
          />
        </Label>
      </div>

      {status.kind === "filled" && (
        <p role="status" className="text-xs text-muted">
          Filled from this device
          {status.accuracyMetres !== null ? ` (accurate to about ${status.accuracyMetres} m)` : ""}. Check it looks
          right, then save.
        </p>
      )}
      {status.kind === "error" && (
        <p role="status" className="text-xs text-warning">
          {status.message}
        </p>
      )}
    </div>
  );
}
