import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { NearMeSearch } from "@/components/discovery/NearMeSearch";
import { DiscoveryTabs, type DiscoveryTab } from "@/components/discovery/DiscoveryTabs";
import { DiscoveryCard, CardAction } from "@/components/discovery/DiscoveryCard";
import { DiscoverySearchForm } from "@/components/discovery/DiscoverySearchForm";
import { FilterChipGroup } from "@/components/discovery/FilterChips";
import { NoResults } from "@/components/discovery/NoResults";
import { Pagination } from "@/components/discovery/Pagination";
import { StaticMap, type MapMarker } from "@/components/discovery/StaticMap";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { formatDistanceKm } from "@/lib/geo/distance";
import { resolveLocationAnchor } from "@/lib/geo/anchors";
import {
  buildFacilityDiscoveryWhere,
  findNearbyClinics,
  loadLocationAnchors,
  type FacilityDiscoveryFilters,
} from "@/lib/geo/nearby";
import { parseLocationSearchParams } from "@/lib/geo/searchParams";
import { loadDiscoveryCounts } from "@/lib/discovery/counts";
import { emptyToUndefined, firstValue } from "@/lib/discovery/searchParams";
import { buildPageInfo, parsePage } from "@/lib/discovery/pagination";
import { buildFacilityFilterWhere, hasAnyDiscoveryFilter, parseDiscoveryFilters } from "@/lib/discovery/filters";
import { facilityOrderBy, parseFacilitySort, type FacilitySort } from "@/lib/discovery/sorting";
import { FacilityDiscoveryControls } from "@/components/discovery/DiscoveryControls";
import type { Prisma } from "@/generated/prisma/client";

// Clinic and hospital discovery: the facility-shaped half of the search
// that /doctors is the doctor-shaped half of.
//
// One component behind two routes (/clinics and /hospitals) because a
// hospital is the same Clinic row at a different scale — the same reason
// the data model has a facilityType discriminator instead of two tables.
// Splitting the *routes* is still right: they are two different things to
// go looking for, and a patient who wants a hospital does not want to
// filter one out of a list.

const filtersSchema = z.object({
  name: z.string().trim().min(1).optional(),
  specialty: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
});

const MAX_PLACE_SUGGESTIONS = 8;

interface FacilityDiscoveryProps {
  facilityType: "CLINIC" | "HOSPITAL";
  searchParams: Record<string, string | string[] | undefined>;
}

const COPY = {
  CLINIC: {
    tab: "clinics" as DiscoveryTab,
    basePath: "/clinics",
    heading: "Find a clinic near you",
    lead: "Browse listed clinics, see which doctors practise there, and book a digital token.",
    singular: "clinic",
    plural: "clinics",
    namePlaceholder: "Clinic name",
  },
  HOSPITAL: {
    tab: "hospitals" as DiscoveryTab,
    basePath: "/hospitals",
    heading: "Find a hospital near you",
    lead: "Browse listed hospitals, see their specialities and doctors, and book a digital token.",
    singular: "hospital",
    plural: "hospitals",
    namePlaceholder: "Hospital name",
  },
} as const;

export async function FacilityDiscovery({ facilityType, searchParams }: FacilityDiscoveryProps) {
  const copy = COPY[facilityType];
  const filters = filtersSchema.parse({
    name: emptyToUndefined(firstValue(searchParams.name)),
    specialty: emptyToUndefined(firstValue(searchParams.specialty)),
    city: emptyToUndefined(firstValue(searchParams.city)),
  });

  const location = parseLocationSearchParams({
    lat: firstValue(searchParams.lat),
    lng: firstValue(searchParams.lng),
    near: firstValue(searchParams.near),
    radiusKm: firstValue(searchParams.radiusKm) ?? firstValue(searchParams.radius),
  });

  const anchors = await loadLocationAnchors();
  const matchedAnchor =
    location.origin === null && location.near ? resolveLocationAnchor(location.near, anchors) : null;
  const origin =
    location.origin ??
    (matchedAnchor ? { latitude: matchedAnchor.latitude, longitude: matchedAnchor.longitude } : null);
  const unmatchedPlace = location.origin === null && location.near !== null && matchedAnchor === null;

  const searchFilters: FacilityDiscoveryFilters = {
    ...filters,
    facility: facilityType,
    // Same rule as the doctor search: a radius and a city-name filter are
    // competing answers to "where", so the location wins when both exist.
    city: origin ? undefined : filters.city,
  };

  const requestedPage = parsePage(firstValue(searchParams.page));
  const refineFilters = parseDiscoveryFilters(searchParams);
  const sort = parseFacilitySort(searchParams, origin !== null);
  const refineWhere = buildFacilityFilterWhere(refineFilters, new Date());

  const [facilityPage, specialtyGroups] = await Promise.all([
    loadFacilities(searchFilters, origin, location.radiusKm, requestedPage, sort, refineWhere),
    // Specialities actually available at facilities of this type, with a
    // count of the doctors offering them — the useful way into a hospital
    // list, where "which department?" is the real question.
    prisma.doctor.groupBy({
      by: ["specialty"],
      where: { isActive: true, clinic: buildFacilityDiscoveryWhere({ facility: facilityType }) },
      _count: { _all: true },
      orderBy: { specialty: "asc" },
    }),
  ]);

  const results = facilityPage.results;
  const pageInfo = facilityPage.info;

  const counts = await loadDiscoveryCounts(
    {
      filters: { specialty: filters.specialty, city: filters.city },
      origin,
      radiusKm: location.radiusKm,
      extraFacilityWhere: refineWhere,
    },
    facilityType === "CLINIC" ? { clinics: pageInfo.total } : { hospitals: pageInfo.total },
  );

  // "Next available" across every doctor at each facility, in one query
  // rather than one per card.
  const clinicIds = results.map((result) => result.clinic.id);
  const upcomingSessions =
    clinicIds.length > 0
      ? await prisma.session.findMany({
          where: {
            clinicId: { in: clinicIds },
            status: { in: ["SCHEDULED", "OPEN", "IN_PROGRESS"] },
            plannedEndAt: { gte: new Date() },
            doctor: { isActive: true },
          },
          orderBy: { plannedStartAt: "asc" },
        })
      : [];
  const nextSessionByClinic = new Map<string, (typeof upcomingSessions)[number]>();
  for (const session of upcomingSessions) {
    if (!nextSessionByClinic.has(session.clinicId)) nextSessionByClinic.set(session.clinicId, session);
  }

  const hasFilters = Boolean(filters.name || filters.specialty || filters.city) || hasAnyDiscoveryFilter(refineFilters);

  const mapMarkers: MapMarker[] = results.flatMap(({ clinic }, index) =>
    clinic.latitude === null || clinic.longitude === null
      ? []
      : [
          {
            key: clinic.id,
            latitude: clinic.latitude,
            longitude: clinic.longitude,
            label: `${clinic.name}, ${clinic.city}`,
            href: `/facilities/${clinic.slug}`,
            // Numbered from the page's first result, not from 1 overall, so
            // the badge matches what the reader is looking at.
            badge: String(pageInfo.skip + index + 1),
          },
        ],
  );
  const hasLocation = origin !== null;

  const preservedFilters: Record<string, string> = {};
  if (filters.specialty) preservedFilters.specialty = filters.specialty;
  if (filters.name) preservedFilters.name = filters.name;

  // Only the filters that mean the same thing on every tab travel with a
  // tab switch. `name` does not: it is a facility name here and a doctor's
  // name on /doctors.
  const carriedParams: Record<string, string> = {};
  if (filters.specialty) carriedParams.specialty = filters.specialty;
  if (location.origin) {
    carriedParams.lat = String(location.origin.latitude);
    carriedParams.lng = String(location.origin.longitude);
  } else if (location.near) {
    carriedParams.near = location.near;
  } else if (filters.city) {
    carriedParams.city = filters.city;
  }
  if (hasLocation) carriedParams.radiusKm = String(location.radiusKm);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.heading}</h1>
            <p className="text-base text-muted">{copy.lead}</p>
          </div>

          <DiscoveryTabs active={copy.tab} counts={counts} carriedParams={carriedParams} />

          <NearMeSearch
            basePath={copy.basePath}
            preservedFilters={preservedFilters}
            radiusKm={location.radiusKm}
            deviceOrigin={location.origin}
            nearQuery={location.near ?? ""}
            matchedPlaceLabel={matchedAnchor?.label ?? null}
            suggestions={anchors.slice(0, MAX_PLACE_SUGGESTIONS).map((anchor) => anchor.label)}
          />

          {unmatchedPlace && (
            <Alert variant="warning">
              We don&apos;t have any listed facilities matching &ldquo;{location.near}&rdquo; yet, so results below
              aren&apos;t sorted by distance. Try a nearby city, or search by name.
            </Alert>
          )}

          <DiscoverySearchForm
            action={copy.basePath}
            namePlaceholder={copy.namePlaceholder}
            specialtyPlaceholder="Speciality available"
            nameValue={filters.name}
            specialtyValue={filters.specialty}
            cityValue={filters.city}
            hasLocation={hasLocation}
            origin={location.origin}
            near={location.near}
            radiusKm={location.radiusKm}
          />
        </div>

        <FilterChipGroup
          heading={facilityType === "HOSPITAL" ? "Browse by department" : "Browse by speciality"}
          basePath={copy.basePath}
          params={searchParams}
          paramKey="specialty"
          activeValue={filters.specialty}
          options={specialtyGroups.map((group) => ({
            value: group.specialty,
            label: group.specialty,
            count: group._count._all,
          }))}
        />

        <FacilityDiscoveryControls
          basePath={copy.basePath}
          params={searchParams}
          filters={refineFilters}
          sort={sort}
          hasLocation={hasLocation}
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {pageInfo.total} {pageInfo.total === 1 ? copy.singular : copy.plural}
              {hasLocation ? ` within ${location.radiusKm} km` : hasFilters ? " matching" : " listed"}
            </h2>
            {(hasFilters || hasLocation) && (
              <Link href={copy.basePath} className="text-sm text-primary underline underline-offset-2">
                Clear filters
              </Link>
            )}
          </div>

          {/* Only the geocoded facilities on THIS page get a pin, numbered
              to match the list beneath — a map showing results the reader
              cannot see below it is a puzzle, not a summary. */}
          {mapMarkers.length > 0 && <StaticMap markers={mapMarkers} viewerOrigin={origin} />}

          {results.length === 0 ? (
            <NoResults
              basePath={copy.basePath}
              params={searchParams}
              plural={copy.plural}
              hasLocation={hasLocation}
              hasFilters={hasFilters}
              radiusKm={location.radiusKm}
                        />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {results.map(({ clinic, distanceKm, doctorCount, specialties, verifiedDoctorCount }) => {
                const next = nextSessionByClinic.get(clinic.id);
                return (
                  <li key={clinic.id}>
                    <DiscoveryCard
                      href={`/facilities/${clinic.slug}`}
                      title={clinic.name}
                      titleAdornment={
                        clinic.facilityType === "HOSPITAL" ? <Badge variant="info">Hospital</Badge> : null
                      }
                      footer={
                        <div className="flex items-center justify-between gap-2">
                          {next ? (
                            <span className="flex items-center gap-1.5 font-semibold text-success">
                              <span className="h-2 w-2 rounded-full bg-success"></span>
                              Next: {formatClinicDate(next.sessionDate)}, {formatClinicTime(next.plannedStartAt)}
                            </span>
                          ) : (
                            <span className="text-muted">No upcoming sessions</span>
                          )}
                          <span className="font-semibold text-primary">View &amp; Book &rarr;</span>
                        </div>
                      }
                    >
                      <div className="flex flex-col gap-1 text-sm text-muted">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span>
                            {clinic.addressLine}
                            {clinic.areaLabel ? `, ${clinic.areaLabel}` : ""}, {clinic.city}
                          </span>
                          {distanceKm !== null && (
                            <span className="font-medium text-foreground">{formatDistanceKm(distanceKm)} away</span>
                          )}
                        </span>
                        <span>
                          {doctorCount} {doctorCount === 1 ? "doctor" : "doctors"}
                          {verifiedDoctorCount > 0 && ` · ${verifiedDoctorCount} verified`}
                        </span>
                        {specialties.length > 0 && <span className="line-clamp-2">{specialties.join(" · ")}</span>}
                      </div>

                      {/* Calling reception is often what a patient actually
                          wants from a facility listing, and it was
                          impossible while the card was one big link. */}
                      <CardAction className="flex flex-wrap gap-x-4 text-sm">
                        <a
                          href={`tel:${clinic.phone}`}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Call {clinic.phone}
                        </a>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${clinic.name}, ${clinic.addressLine}, ${clinic.city}`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Directions
                        </a>
                      </CardAction>
                    </DiscoveryCard>
                  </li>
                );
              })}
            </ul>
          )}

          <Pagination basePath={copy.basePath} params={searchParams} info={pageInfo} itemLabel={copy.plural} />
        </div>
      </main>
      <Footer />
    </>
  );
}

interface FacilityResult {
  clinic: {
    id: string;
    slug: string;
    name: string;
    facilityType: "CLINIC" | "HOSPITAL";
    addressLine: string;
    areaLabel: string | null;
    city: string;
    phone: string;
    latitude: number | null;
    longitude: number | null;
  };
  distanceKm: number | null;
  doctorCount: number;
  verifiedDoctorCount: number;
  specialties: string[];
}

// How many specialities a card lists before it stops — a hospital with
// forty departments should not push its own booking link off the card.
const MAX_CARD_SPECIALTIES = 4;

async function loadFacilities(
  filters: FacilityDiscoveryFilters,
  origin: { latitude: number; longitude: number } | null,
  radiusKm: number,
  requestedPage: number,
  sort: FacilitySort,
  extraWhere: Prisma.ClinicWhereInput,
): Promise<{ results: FacilityResult[]; info: ReturnType<typeof buildPageInfo> }> {
  const distanceById = new Map<string, number>();
  let clinicIds: string[];
  let info: ReturnType<typeof buildPageInfo>;

  if (origin && sort === "distance") {
    // Distance ranking happens in application code, so the full candidate
    // set is ranked and then sliced.
    const nearby = await findNearbyClinics({ origin, radiusKm, filters, extraWhere });
    info = buildPageInfo(requestedPage, nearby.length);
    const pageSlice = nearby.slice(info.skip, info.skip + info.pageSize);
    for (const { item, distanceKm } of pageSlice) distanceById.set(item.id, distanceKm);
    clinicIds = pageSlice.map(({ item }) => item.id);
  } else {
    // A non-distance sort with a location still has to respect the radius:
    // "most doctors near me", not "most doctors anywhere". The in-range ids
    // are collected first, then ordered the way the patient asked.
    let radiusIds: string[] | null = null;
    if (origin) {
      const nearby = await findNearbyClinics({ origin, radiusKm, filters, extraWhere });
      radiusIds = nearby.map(({ item }) => item.id);
      for (const { item, distanceKm } of nearby) distanceById.set(item.id, distanceKm);
    }

    const where: Prisma.ClinicWhereInput = {
      ...buildFacilityDiscoveryWhere(filters),
      ...extraWhere,
      ...(radiusIds ? { id: { in: radiusIds } } : {}),
    };
    const total = radiusIds ? radiusIds.length : await prisma.clinic.count({ where });
    info = buildPageInfo(requestedPage, total);
    const listed = await prisma.clinic.findMany({
      where,
      orderBy: facilityOrderBy(sort),
      select: { id: true },
      skip: info.skip,
      take: info.pageSize,
    });
    clinicIds = listed.map((clinic) => clinic.id);
  }

  if (clinicIds.length === 0) return { results: [], info };

  // Doctors are loaded per facility for the speciality summary and the
  // counts. `in` on the already-narrowed id list, so this stays one query
  // regardless of how many facilities matched.
  const clinics = await prisma.clinic.findMany({
    where: { id: { in: clinicIds } },
    select: {
      id: true,
      slug: true,
      name: true,
      facilityType: true,
      addressLine: true,
      areaLabel: true,
      city: true,
      phone: true,
      latitude: true,
      longitude: true,
      doctors: {
        where: { isActive: true },
        select: { specialty: true, verificationStatus: true },
      },
    },
  });

  const byId = new Map(clinics.map((clinic) => [clinic.id, clinic]));

  // Preserves the order the ids arrived in — distance-ranked when there is
  // an origin, alphabetical otherwise.
  const results = clinicIds.flatMap((id) => {
    const clinic = byId.get(id);
    if (!clinic) return [];
    const specialties = [...new Set(clinic.doctors.map((doctor) => doctor.specialty))]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MAX_CARD_SPECIALTIES);
    return [
      {
        clinic: {
          id: clinic.id,
          slug: clinic.slug,
          name: clinic.name,
          facilityType: clinic.facilityType,
          addressLine: clinic.addressLine,
          areaLabel: clinic.areaLabel,
          city: clinic.city,
          phone: clinic.phone,
          latitude: clinic.latitude,
          longitude: clinic.longitude,
        },
        distanceKm: distanceById.get(id) ?? null,
        doctorCount: clinic.doctors.length,
        verifiedDoctorCount: clinic.doctors.filter((doctor) => doctor.verificationStatus === "VERIFIED").length,
        specialties,
      },
    ];
  });

  return { results, info };
}
