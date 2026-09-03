// Great-circle distance and the bounding box that pre-filters it.
//
// Pure functions with no Prisma import, so the maths is unit-testable
// without a database — the same split the prediction and analytics
// libraries use.

/** Mean Earth radius (IUGG). */
const EARTH_RADIUS_KM = 6371.0088;

// One degree of latitude is ~110.574 km everywhere; one degree of
// longitude is ~111.320 km at the equator and shrinks with cos(latitude).
// The smaller of the two is used as the longitude divisor as well, which
// makes the bounding box very slightly WIDER than strictly necessary —
// deliberate, because the box is only a pre-filter and a box that is too
// narrow silently drops real results, while one that is too wide only
// costs a handful of rows that haversine then rejects.
const KM_PER_DEGREE_LATITUDE = 110.574;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** A latitude band plus one or two longitude ranges (two when the box crosses the antimeridian). */
export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  longitudeRanges: { min: number; max: number }[];
}

const FULL_LONGITUDE_RANGE = [{ min: -180, max: 180 }];

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidCoordinates(value: Partial<Coordinates> | null | undefined): value is Coordinates {
  return (
    value != null &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    isValidLatitude(value.latitude) &&
    isValidLongitude(value.longitude)
  );
}

/** Haversine great-circle distance in kilometres. */
export function haversineDistanceKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// The database cannot compute haversine through Prisma's query API (no
// raw SQL here, and no PostGIS — CLAUDE.md's locked stack), so the radius
// filter runs in two stages: an indexable latitude/longitude BETWEEN in
// SQL that returns a small superset, then exact haversine in TypeScript.
// The box is a superset of the circle by construction, so nothing inside
// the radius is ever excluded by this step.
export function boundingBox(origin: Coordinates, radiusKm: number): BoundingBox {
  const latitudeDelta = radiusKm / KM_PER_DEGREE_LATITUDE;
  const minLatitude = Math.max(-90, origin.latitude - latitudeDelta);
  const maxLatitude = Math.min(90, origin.latitude + latitudeDelta);

  // Near a pole a degree of longitude is worth almost nothing, so the box
  // degenerates into "every longitude" rather than dividing by ~0.
  const cosLatitude = Math.cos(toRadians(Math.max(Math.abs(minLatitude), Math.abs(maxLatitude))));
  if (minLatitude <= -90 || maxLatitude >= 90 || cosLatitude < 1e-9) {
    return { minLatitude, maxLatitude, longitudeRanges: FULL_LONGITUDE_RANGE };
  }

  const longitudeDelta = radiusKm / (KM_PER_DEGREE_LATITUDE * cosLatitude);
  if (longitudeDelta >= 180) {
    return { minLatitude, maxLatitude, longitudeRanges: FULL_LONGITUDE_RANGE };
  }

  const minLongitude = origin.longitude - longitudeDelta;
  const maxLongitude = origin.longitude + longitudeDelta;

  // Antimeridian wrap: a single BETWEEN would be an empty range, so it
  // becomes two. India never triggers this, but a helper that returns a
  // silently empty result set at ±180 is a trap for whoever reuses it.
  if (minLongitude < -180) {
    return {
      minLatitude,
      maxLatitude,
      longitudeRanges: [
        { min: -180, max: maxLongitude },
        { min: minLongitude + 360, max: 180 },
      ],
    };
  }
  if (maxLongitude > 180) {
    return {
      minLatitude,
      maxLatitude,
      longitudeRanges: [
        { min: minLongitude, max: 180 },
        { min: -180, max: maxLongitude - 360 },
      ],
    };
  }

  return { minLatitude, maxLatitude, longitudeRanges: [{ min: minLongitude, max: maxLongitude }] };
}

export interface Ranked<T> {
  item: T;
  distanceKm: number;
}

/**
 * Exact radius filter + nearest-first ordering. Items whose coordinates
 * are missing or invalid are dropped: an un-geocoded facility has no
 * defensible position in a "nearest" list, and defaulting it to 0 km
 * would put it first.
 */
export function rankByDistance<T>(
  items: readonly T[],
  origin: Coordinates,
  radiusKm: number,
  getCoordinates: (item: T) => Partial<Coordinates> | null | undefined,
): Ranked<T>[] {
  const ranked: Ranked<T>[] = [];
  for (const item of items) {
    const coordinates = getCoordinates(item);
    if (!isValidCoordinates(coordinates)) continue;
    const distanceKm = haversineDistanceKm(origin, coordinates);
    if (distanceKm > radiusKm) continue;
    ranked.push({ item, distanceKm });
  }
  return ranked.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * "850 m" / "1.8 km" / "12 km". Never more precision than the underlying
 * data supports: coordinates are stored to ~100 m and the patient's own
 * position is coarsened before it is sent, so "1.83 km" would be a lie
 * about how well we know where anyone is.
 */
export function formatDistanceKm(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return "—";
  if (distanceKm < 1) return `${Math.max(50, Math.round((distanceKm * 1000) / 50) * 50)} m`;
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}
