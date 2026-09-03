import type { Coordinates } from "./distance";
import { latitudeSchema, longitudeSchema } from "./searchParams";

// Coordinate entry, shared by every form that creates or edits a facility:
// the owner's clinic profile, facility self-signup and independent-doctor
// self-signup. One parser, because the failure that matters is asymmetric
// — a half-entered pair, silently stored, puts a real clinic on the prime
// meridian and shows patients a distance of several thousand kilometres.

export type CoordinatePairResult =
  | { ok: true; coordinates: Coordinates | null }
  | { ok: false; error: string };

// An empty box means "not recorded", never 0 — which is a real point in
// the Gulf of Guinea. Clearing both boxes is how a facility removes a
// wrong location.
function optionalCoordinate(value: FormDataEntryValue | null): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Both boxes or neither. Returns `coordinates: null` when the facility
 * simply has not been geocoded — a valid, fully listed state that only
 * excludes it from radius search.
 */
export function parseCoordinatePairFields(
  latitudeValue: FormDataEntryValue | null,
  longitudeValue: FormDataEntryValue | null,
): CoordinatePairResult {
  const rawLatitude = optionalCoordinate(latitudeValue);
  const rawLongitude = optionalCoordinate(longitudeValue);

  if (rawLatitude === undefined && rawLongitude === undefined) {
    return { ok: true, coordinates: null };
  }
  if (rawLatitude === undefined || rawLongitude === undefined) {
    return { ok: false, error: "Enter both latitude and longitude, or leave both blank." };
  }

  const latitude = latitudeSchema.safeParse(rawLatitude);
  const longitude = longitudeSchema.safeParse(rawLongitude);
  if (!latitude.success || !longitude.success) {
    return {
      ok: false,
      error: "Enter a latitude between -90 and 90 and a longitude between -180 and 180, or leave both blank.",
    };
  }

  return { ok: true, coordinates: { latitude: latitude.data, longitude: longitude.data } };
}
