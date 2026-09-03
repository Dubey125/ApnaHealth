import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { LISTED_CLINIC, LISTED_DOCTOR } from "@/lib/publicListing";
import { boundingBox, rankByDistance, type Coordinates, type Ranked } from "./distance";
import { buildLocationAnchors, resolveLocationAnchor, type LocationAnchor } from "./anchors";

// Radius search over the public directory.
//
// Every query here goes through LISTED_CLINIC / LISTED_DOCTOR, so a
// pending or rejected facility is no more discoverable by coordinates
// than it is by name — proximity is a new way to sort the public
// directory, never a new way into it.

export type FacilityTypeFilter = "CLINIC" | "HOSPITAL";

export interface DoctorDiscoveryFilters {
  specialty?: string;
  name?: string;
  facility?: FacilityTypeFilter;
  /** Free-text city/area match. Ignored by the nearby queries, which locate by coordinates instead. */
  city?: string;
}

export interface FacilityDiscoveryFilters {
  /** Facility name. */
  name?: string;
  /** Only facilities with a listed doctor in this specialty. */
  specialty?: string;
  facility?: FacilityTypeFilter;
  city?: string;
}

const insensitive = { mode: "insensitive" } as const;

/**
 * The non-geographic half of doctor discovery, shared by the plain
 * listing and the radius search so the two can't drift apart.
 * `extraClinicWhere` is how the radius search adds its bounding box
 * without either caller having to rebuild the listing rules.
 */
export function buildDoctorDiscoveryWhere(
  filters: DoctorDiscoveryFilters,
  extraClinicWhere?: Prisma.ClinicWhereInput,
): Prisma.DoctorWhereInput {
  const clinicWhere: Prisma.ClinicWhereInput = {
    ...LISTED_CLINIC,
    ...extraClinicWhere,
    ...(filters.facility ? { facilityType: filters.facility } : {}),
    ...(filters.city
      ? {
          OR: [
            { city: { contains: filters.city, ...insensitive } },
            { areaLabel: { contains: filters.city, ...insensitive } },
          ],
        }
      : {}),
  };

  return {
    ...LISTED_DOCTOR,
    clinic: clinicWhere,
    ...(filters.specialty ? { specialty: { contains: filters.specialty, ...insensitive } } : {}),
    ...(filters.name ? { name: { contains: filters.name, ...insensitive } } : {}),
  };
}

/**
 * The non-geographic half of facility discovery. The mirror of
 * buildDoctorDiscoveryWhere, and separate from it on purpose: a patient
 * browsing hospitals is asking a different question from one browsing
 * doctors, and `specialty` means something different in each — "this
 * doctor practises it" versus "some doctor here practises it".
 */
export function buildFacilityDiscoveryWhere(
  filters: FacilityDiscoveryFilters,
  extraClinicWhere?: Prisma.ClinicWhereInput,
): Prisma.ClinicWhereInput {
  return {
    ...LISTED_CLINIC,
    ...extraClinicWhere,
    ...(filters.facility ? { facilityType: filters.facility } : {}),
    // A listed facility with no active doctor has nothing a patient can
    // do with it, so it is not a discovery result. The specialty filter
    // rides on the same relation: one `some` clause, both conditions,
    // which is what makes it mean "has a cardiologist" rather than "has
    // some active doctor AND has some cardiologist (possibly inactive)".
    doctors: {
      some: {
        isActive: true,
        ...(filters.specialty ? { specialty: { contains: filters.specialty, ...insensitive } } : {}),
      },
    },
    ...(filters.name ? { name: { contains: filters.name, ...insensitive } } : {}),
    ...(filters.city
      ? {
          OR: [
            { city: { contains: filters.city, ...insensitive } },
            { areaLabel: { contains: filters.city, ...insensitive } },
          ],
        }
      : {}),
  };
}

/**
 * Bounding-box clause for a clinic. Kept under `AND` so it composes with
 * a caller's own `OR` (the city/area text match) instead of overwriting
 * it — a top-level `OR` here would silently replace theirs.
 */
export function clinicWithinBoxWhere(origin: Coordinates, radiusKm: number): Prisma.ClinicWhereInput {
  const box = boundingBox(origin, radiusKm);
  return {
    AND: [
      { latitude: { gte: box.minLatitude, lte: box.maxLatitude } },
      { OR: box.longitudeRanges.map((range) => ({ longitude: { gte: range.min, lte: range.max } })) },
    ],
  };
}

// A generous ceiling on how many rows the box may return before the exact
// distance filter runs. It bounds the work a hand-written 50 km radius in
// a dense city can cause, and it is applied to the *candidate* set, not to
// the answer, so the visible result count is still whatever fits the
// radius. Ordered by id for a stable, non-arbitrary truncation.
const MAX_CANDIDATES = 500;

export interface NearbyDoctorsOptions {
  origin: Coordinates;
  radiusKm: number;
  filters?: DoctorDiscoveryFilters;
  /** Extra doctor-level clauses (fee, experience, availability). */
  extraWhere?: Prisma.DoctorWhereInput;
  limit?: number;
}

export type NearbyDoctor = Ranked<Prisma.DoctorGetPayload<{ include: { clinic: true } }>>;
export type NearbyClinic = Ranked<Prisma.ClinicGetPayload<{ include: { _count: { select: { doctors: true } } } }>>;

export async function findNearbyDoctors({
  origin,
  radiusKm,
  filters = {},
  extraWhere,
  limit,
}: NearbyDoctorsOptions): Promise<NearbyDoctor[]> {
  const candidates = await prisma.doctor.findMany({
    where: {
      ...buildDoctorDiscoveryWhere({ ...filters, city: undefined }, clinicWithinBoxWhere(origin, radiusKm)),
      ...extraWhere,
    },
    include: { clinic: true },
    orderBy: { id: "asc" },
    take: MAX_CANDIDATES,
  });

  const ranked = rankByDistance(candidates, origin, radiusKm, (doctor) => ({
    latitude: doctor.clinic.latitude ?? Number.NaN,
    longitude: doctor.clinic.longitude ?? Number.NaN,
  }));
  return limit ? ranked.slice(0, limit) : ranked;
}

export interface NearbyClinicsOptions {
  origin: Coordinates;
  radiusKm: number;
  filters?: FacilityDiscoveryFilters;
  /** Extra facility-level clauses (e.g. has a session still to come today). */
  extraWhere?: Prisma.ClinicWhereInput;
  limit?: number;
}

export async function findNearbyClinics({
  origin,
  radiusKm,
  filters = {},
  extraWhere,
  limit,
}: NearbyClinicsOptions): Promise<NearbyClinic[]> {
  const candidates = await prisma.clinic.findMany({
    // `city` is dropped for the same reason it is in the doctor search:
    // "within 5 km of me" and "in a place whose name contains Pune" are
    // competing answers, and applying both hides the hospital two streets
    // away that happens to sit in the next locality.
    where: {
      ...buildFacilityDiscoveryWhere({ ...filters, city: undefined }, clinicWithinBoxWhere(origin, radiusKm)),
      ...extraWhere,
    },
    include: { _count: { select: { doctors: true } } },
    orderBy: { id: "asc" },
    take: MAX_CANDIDATES,
  });

  const ranked = rankByDistance(candidates, origin, radiusKm, (clinic) => ({
    latitude: clinic.latitude ?? Number.NaN,
    longitude: clinic.longitude ?? Number.NaN,
  }));
  return limit ? ranked.slice(0, limit) : ranked;
}

/**
 * The anchor table for manual ("I'd rather not share my location")
 * search, built from listed, geocoded facilities. Small by construction —
 * one row per listed facility — and read on the discovery page only.
 */
export async function loadLocationAnchors(): Promise<LocationAnchor[]> {
  const rows = await prisma.clinic.findMany({
    where: {
      ...LISTED_CLINIC,
      latitude: { not: null },
      longitude: { not: null },
      doctors: { some: { isActive: true } },
    },
    select: { areaLabel: true, city: true, postalCode: true, latitude: true, longitude: true },
  });
  return buildLocationAnchors(rows);
}

export interface ResolvedOrigin {
  origin: Coordinates;
  /** Set when the origin came from typed text rather than the browser. */
  anchor: LocationAnchor | null;
}

/**
 * Coordinates from the browser win over typed text: if a patient granted
 * location access, that is the more accurate answer to "where am I", and
 * a stale `near=` left in the URL must not override it.
 */
export async function resolveSearchOrigin(
  browserOrigin: Coordinates | null,
  near: string | null,
): Promise<ResolvedOrigin | null> {
  if (browserOrigin) return { origin: browserOrigin, anchor: null };
  if (!near) return null;

  const anchor = resolveLocationAnchor(near, await loadLocationAnchors());
  if (!anchor) return null;
  return { origin: { latitude: anchor.latitude, longitude: anchor.longitude }, anchor };
}
