"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { coarsenCoordinates, RADIUS_OPTIONS_KM } from "@/lib/geo/searchParams";

// The patient-facing half of proximity search.
//
// Three rules shape this component:
//
// 1. Coordinates are read only after the browser reports permission was
//    granted — getCurrentPosition's success callback is the only place a
//    position is ever touched, and the browser does not call it before the
//    patient answers the prompt.
// 2. Every geolocation outcome has a written fallback. A denied prompt, a
//    blocked API, a device with no fix and a browser with no Geolocation
//    support all land in the same place: the manual box, which needs
//    neither permission nor JavaScript.
// 3. The position is coarsened here, in the browser, before it goes into
//    the URL — the precise fix never leaves the device.

interface DeviceOrigin {
  latitude: number;
  longitude: number;
}

export interface NearMeSearchProps {
  /** The discovery route this panel searches within: /doctors, /clinics or /hospitals. */
  basePath: string;
  /** Filters to carry across a location search (specialty, name, facility). */
  preservedFilters: Record<string, string>;
  radiusKm: number;
  /** Coarse coordinates already in the URL, if the patient shared their location. */
  deviceOrigin: DeviceOrigin | null;
  /** The place text the patient typed, if any. */
  nearQuery: string;
  /** What that text resolved to, e.g. "Koregaon Park, Pune". */
  matchedPlaceLabel: string | null;
  /** Places worth suggesting to someone who would rather type than share GPS. */
  suggestions: string[];
}

type GeolocationState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "timeout" }
  | { kind: "unsupported" };

type FailureKind = Exclude<GeolocationState["kind"], "idle" | "locating">;

const MESSAGES: Record<FailureKind, string> = {
  denied:
    "Location access is blocked for this site. Allow it from your browser's address bar, or type your area or PIN code instead.",
  unavailable: "Your device could not determine a location right now. Type your area or PIN code instead.",
  timeout: "Finding your location took too long. Try again, or type your area or PIN code instead.",
  unsupported: "This browser does not support location search. Type your area or PIN code instead.",
};

export function NearMeSearch({
  basePath,
  preservedFilters,
  radiusKm,
  deviceOrigin,
  nearQuery,
  matchedPlaceLabel,
  suggestions,
}: NearMeSearchProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<GeolocationState>({ kind: "idle" });
  // Mirrors the URL, but is cleared as soon as the patient starts typing a
  // place — otherwise the stale device position would win over what they
  // just typed, since the server resolves device coordinates first.
  const [origin, setOrigin] = useState<DeviceOrigin | null>(deviceOrigin);
  const [near, setNear] = useState(nearQuery);
  const [radius, setRadius] = useState(radiusKm);

  const hasOrigin = origin !== null || matchedPlaceLabel !== null;

  const buildHref = useMemo(
    () => (params: { origin?: DeviceOrigin | null; near?: string; radiusKm?: number }) => {
      const search = new URLSearchParams(preservedFilters);
      const nextOrigin = params.origin === undefined ? origin : params.origin;
      const nextNear = (params.near === undefined ? near : params.near).trim();

      if (nextOrigin) {
        search.set("lat", String(nextOrigin.latitude));
        search.set("lng", String(nextOrigin.longitude));
      } else if (nextNear.length > 0) {
        search.set("near", nextNear);
      }
      if (nextOrigin || nextNear.length > 0) {
        search.set("radiusKm", String(params.radiusKm ?? radius));
      }
      return `${basePath}?${search.toString()}`;
    },
    [basePath, preservedFilters, origin, near, radius],
  );

  function requestLocation() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ kind: "unsupported" });
      return;
    }

    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // The first and only point at which a position is read. The
        // browser calls this after, and only after, permission is granted.
        const coarse = coarsenCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setState({ kind: "idle" });
        setOrigin(coarse);
        setNear("");
        startTransition(() => router.push(buildHref({ origin: coarse, near: "" })));
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setState({ kind: "denied" });
        else if (error.code === error.TIMEOUT) setState({ kind: "timeout" });
        else setState({ kind: "unavailable" });
      },
      {
        // Street-level accuracy is more than a 5 km radius needs, and the
        // high-accuracy path costs battery and time for no better answer.
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 5 * 60_000,
      },
    );
  }

  const busy = pending || state.kind === "locating";
  const message = state.kind === "idle" || state.kind === "locating" ? null : MESSAGES[state.kind];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" onClick={requestLocation} disabled={busy} className="sm:w-auto">
          <PinIcon />
          {state.kind === "locating" ? "Finding you…" : "Search near you"}
        </Button>

        <span className="text-sm text-muted sm:px-1">or</span>

        {/* A plain GET form, so manual search still works with JavaScript
            off, with geolocation blocked, and on a browser that has never
            heard of the Permissions API. */}
        <form method="GET" action={basePath} className="flex flex-1 flex-col gap-2 sm:flex-row">
          {Object.entries(preservedFilters).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <input type="hidden" name="radiusKm" value={radius} />
          <Input
            name="near"
            value={near}
            onChange={(event) => {
              setNear(event.target.value);
              // Typing a place is an explicit choice not to use the device
              // position, so drop it rather than let it take precedence.
              setOrigin(null);
            }}
            list="near-suggestions"
            placeholder="Area, city or PIN code"
            aria-label="Search by area, city or PIN code"
            className="sm:flex-1"
          />
          <datalist id="near-suggestions">
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          <Button type="submit" variant="secondary" disabled={busy}>
            Search here
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          Within
          <select
            value={radius}
            onChange={(event) => {
              const nextRadius = Number(event.target.value);
              setRadius(nextRadius);
              // Only re-searches when there is an origin to re-search
              // around; otherwise it is simply the value the form below
              // will submit with.
              if (hasOrigin) startTransition(() => router.push(buildHref({ radiusKm: nextRadius })));
            }}
            aria-label="Search radius"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {RADIUS_OPTIONS_KM.map((option) => (
              <option key={option} value={option}>
                {option} km
              </option>
            ))}
          </select>
        </label>

        {hasOrigin && (
          <span className="text-sm text-muted">
            Searching around{" "}
            <span className="font-medium text-foreground">{matchedPlaceLabel ?? "your location"}</span>
          </span>
        )}
        {hasOrigin && (
          <Link
            href={`${basePath}?${new URLSearchParams(preservedFilters).toString()}`}
            className="text-sm text-primary underline underline-offset-2"
          >
            Clear location
          </Link>
        )}
      </div>

      {message && (
        <p role="status" className={cn("text-sm", state.kind === "denied" ? "text-warning" : "text-muted")}>
          {message}
        </p>
      )}

      <p className="text-xs text-muted">
        Your location is used only to sort this page. It is rounded to about 100&nbsp;m before it is sent, and is
        never saved to your record.
      </p>
    </div>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
