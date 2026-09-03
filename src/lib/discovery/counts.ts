import { prisma } from "@/lib/db";
import type { Coordinates } from "@/lib/geo/distance";
import type { Prisma } from "@/generated/prisma/client";
import {
  buildDoctorDiscoveryWhere,
  buildFacilityDiscoveryWhere,
  findNearbyClinics,
  findNearbyDoctors,
  type DoctorDiscoveryFilters,
} from "@/lib/geo/nearby";

// The numbers on the Doctors / Clinics / Hospitals tabs.
//
// They count what each tab would actually show under the filters in play,
// including the location — a "Hospitals 6" tab that lands on "no hospitals
// within 5 km" is worse than no number at all.
//
// With a location active this necessarily runs the same shape of query the
// tab itself would: the exact radius filter is haversine in application
// code (see lib/geo/distance), so there is no COUNT(*) that can answer
// "how many are within 5 km". The candidate sets are bounding-box-limited
// and small; revisit if a city ever holds thousands of listed facilities.

export interface DiscoverySearchContext {
  filters: DoctorDiscoveryFilters;
  origin: Coordinates | null;
  radiusKm: number;
  /** Doctor-level refinements (fee, experience, availability today). */
  extraWhere?: Prisma.DoctorWhereInput;
  /** The facility-level equivalent, for the clinic and hospital counts. */
  extraFacilityWhere?: Prisma.ClinicWhereInput;
}

async function countDoctors({ filters, origin, radiusKm, extraWhere }: DiscoverySearchContext): Promise<number> {
  if (origin) {
    return (await findNearbyDoctors({ origin, radiusKm, filters, extraWhere })).length;
  }
  return prisma.doctor.count({ where: { ...buildDoctorDiscoveryWhere(filters), ...extraWhere } });
}

/**
 * Clinic and hospital counts together.
 *
 * With a location this is ONE radius search, not two. Counting the tabs
 * separately meant two bounding-box queries and two full haversine passes
 * over the same candidate set, differing only in a facilityType filter
 * applied at the end — so the type is applied at the end instead.
 *
 * `name` is deliberately not carried across from the doctor filters: there
 * it means a doctor's name, and matching a facility against it would make
 * the hospital tab read zero for every doctor-name search.
 */
async function countFacilitiesByType({
  filters,
  origin,
  radiusKm,
  extraFacilityWhere,
}: DiscoverySearchContext): Promise<{ clinics: number; hospitals: number }> {
  const shared = { specialty: filters.specialty, city: filters.city };

  if (origin) {
    const nearby = await findNearbyClinics({
      origin,
      radiusKm,
      filters: shared,
      extraWhere: extraFacilityWhere,
    });
    return {
      clinics: nearby.filter(({ item }) => item.facilityType === "CLINIC").length,
      hospitals: nearby.filter(({ item }) => item.facilityType === "HOSPITAL").length,
    };
  }

  // Without a location these are two indexed COUNT(*)s, which is already
  // cheaper than fetching rows to count them.
  const [clinics, hospitals] = await Promise.all(
    (["CLINIC", "HOSPITAL"] as const).map((facility) =>
      prisma.clinic.count({
        where: { ...buildFacilityDiscoveryWhere({ ...shared, facility }), ...extraFacilityWhere },
      }),
    ),
  );
  return { clinics, hospitals };
}

export interface DiscoveryCounts {
  doctors: number;
  clinics: number;
  hospitals: number;
}

/**
 * All three tab counts. `known` lets the calling page hand in the count it
 * already computed for its own tab, so the active tab is never queried
 * twice.
 */
export async function loadDiscoveryCounts(
  context: DiscoverySearchContext,
  known: Partial<DiscoveryCounts> = {},
): Promise<DiscoveryCounts> {
  // The facility counts are skipped entirely when the caller already knows
  // both — which is never, since a page knows only its own tab — but the
  // guard keeps the shape honest and costs nothing.
  const needsFacilities = known.clinics === undefined || known.hospitals === undefined;

  const [doctors, facilities] = await Promise.all([
    known.doctors !== undefined ? Promise.resolve(known.doctors) : countDoctors(context),
    needsFacilities ? countFacilitiesByType(context) : Promise.resolve({ clinics: 0, hospitals: 0 }),
  ]);

  return {
    doctors,
    clinics: known.clinics ?? facilities.clinics,
    hospitals: known.hospitals ?? facilities.hospitals,
  };
}
