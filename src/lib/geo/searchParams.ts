import { z } from "zod";
import type { Coordinates } from "./distance";

// Radius is per-request configurable, with the platform deciding the menu
// and the ceiling. A patient asking for "within 500 km" is not doing
// proximity search, it is dumping the directory through a sort — so the
// value is clamped rather than trusted.
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 50;
export const DEFAULT_RADIUS_KM = 5;
export const RADIUS_OPTIONS_KM = [2, 5, 10, 25] as const;

// ~110 m at the equator. Enough to rank facilities correctly inside a
// 5-10 km radius, and deliberately not enough to identify a street
// address or a home. The browser hands us far more precision than that;
// PRIVACY_BOUNDARY.md's minimisation rule means we throw the excess away
// in the browser, BEFORE the position is ever sent to the server, so the
// full-precision fix never leaves the device at all.
export const COORDINATE_PRECISION_DP = 3;

export function coarsenCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_PRECISION_DP;
  return Math.round(value * factor) / factor;
}

export function coarsenCoordinates(coordinates: Coordinates): Coordinates {
  return {
    latitude: coarsenCoordinate(coordinates.latitude),
    longitude: coarsenCoordinate(coordinates.longitude),
  };
}

// z.coerce.number() turns "" into 0, and (0, 0) is a real point in the
// Gulf of Guinea — so an empty query parameter must become "absent"
// before coercion ever sees it, not a coordinate.
function optionalNumericInput(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);

// Clamped, not rejected: an out-of-menu radius is a stale bookmark or a
// hand-edited URL, and quietly searching 50 km is a better answer for the
// patient than an error page.
export const radiusKmSchema = z.coerce
  .number()
  .catch(DEFAULT_RADIUS_KM)
  .transform((value) => {
    if (!Number.isFinite(value)) return DEFAULT_RADIUS_KM;
    return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, value));
  });

export interface LocationSearchInput {
  lat?: string | null;
  lng?: string | null;
  near?: string | null;
  radiusKm?: string | null;
}

export interface LocationSearchParams {
  /** Coordinates the patient's browser supplied, already coarse. */
  origin: Coordinates | null;
  /** Free-text place the patient typed instead of sharing GPS. */
  near: string | null;
  radiusKm: number;
}

/**
 * One parser for both the /doctors page and the JSON API, so the two can
 * never disagree about what `?lat=&lng=&radius=` means.
 *
 * A half-supplied pair (lat without lng) resolves to no origin rather than
 * an error — the page must still render its normal listing when a URL is
 * truncated or a bookmark is edited.
 */
export function parseLocationSearchParams(input: LocationSearchInput): LocationSearchParams {
  const latitude = latitudeSchema.safeParse(optionalNumericInput(input.lat));
  const longitude = longitudeSchema.safeParse(optionalNumericInput(input.lng));
  const origin =
    latitude.success && longitude.success
      ? coarsenCoordinates({ latitude: latitude.data, longitude: longitude.data })
      : null;

  const near = input.near?.trim();

  return {
    origin,
    near: near && near.length > 0 ? near.slice(0, 120) : null,
    radiusKm: radiusKmSchema.parse(optionalNumericInput(input.radiusKm) ?? DEFAULT_RADIUS_KM),
  };
}
