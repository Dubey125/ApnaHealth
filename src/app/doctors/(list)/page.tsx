import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Alert } from "@/components/ui/Alert";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { Avatar } from "@/components/ui/Avatar";
import { NearMeSearch } from "@/components/discovery/NearMeSearch";
import { DiscoveryTabs } from "@/components/discovery/DiscoveryTabs";
import { DiscoveryCard, CardAction } from "@/components/discovery/DiscoveryCard";
import { DiscoverySearchForm } from "@/components/discovery/DiscoverySearchForm";
import { FilterChipGroup } from "@/components/discovery/FilterChips";
import { NoResults } from "@/components/discovery/NoResults";
import { Pagination } from "@/components/discovery/Pagination";
import { StaticMap, type MapMarker } from "@/components/discovery/StaticMap";
import { formatClinicDate, formatClinicTime, formatFeeMinor } from "@/lib/format";
import { LISTED_CLINIC } from "@/lib/publicListing";
import { formatDistanceKm } from "@/lib/geo/distance";
import { resolveLocationAnchor } from "@/lib/geo/anchors";
import { buildDoctorDiscoveryWhere, findNearbyDoctors, loadLocationAnchors } from "@/lib/geo/nearby";
import { parseLocationSearchParams } from "@/lib/geo/searchParams";
import { loadDiscoveryCounts } from "@/lib/discovery/counts";
import { emptyToUndefined, firstValue } from "@/lib/discovery/searchParams";
import { buildPageInfo, parsePage, splitAcrossGroups } from "@/lib/discovery/pagination";
import {
  buildDiscoveryFilterWhere,
  buildFacilityFilterWhere,
  hasAnyDiscoveryFilter,
  parseDiscoveryFilters,
} from "@/lib/discovery/filters";
import { doctorOrderBy, parseDoctorSort, usesVerifiedRanking, type DoctorSort } from "@/lib/discovery/sorting";
import { DiscoveryControls } from "@/components/discovery/DiscoveryControls";
import type { Prisma } from "@/generated/prisma/client";

const filtersSchema = z.object({
  specialty: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  // Matched against city OR areaLabel, so "Pune" and "Koregaon Park" both
  // work from the same box rather than forcing the patient to know which
  // level of granularity the clinic happened to record. Distinct from the
  // `near` parameter below: `city` is a text filter, `near` is a location
  // to measure distance from.
  city: z.string().trim().min(1).optional(),
  facility: z.enum(["CLINIC", "HOSPITAL"]).optional(),
});

type Filters = z.infer<typeof filtersSchema>;

// How many place suggestions the manual location box offers.
const MAX_PLACE_SUGGESTIONS = 8;

interface DoctorsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Page-aware, so page 2 is not a duplicate of page 1 in Google's eyes.
//
// The canonical deliberately keeps ?page but drops every filter:
// /doctors?specialty=X is a filtered VIEW of one page and should not
// compete with /doctors for the same terms, whereas page 2 is a genuinely
// different set of content and self-canonicalises. (rel=next/prev is not
// emitted — Google retired support for it in 2019 and treats each page as
// standalone, which is exactly what a self-canonical says.)
export async function generateMetadata({ searchParams }: DoctorsPageProps): Promise<Metadata> {
  const page = parsePage(firstValue((await searchParams).page));
  const suffix = page > 1 ? ` — page ${page}` : "";
  return {
    title: `Find a doctor near you${suffix}`,
    description:
      "Search verified doctors by name, speciality or location. See who is available next, how far away they are, and book a digital OPD token.",
    alternates: { canonical: page > 1 ? `/doctors?page=${page}` : "/doctors" },
  };
}

export default async function DoctorsPage({ searchParams }: DoctorsPageProps) {
  const rawParams = await searchParams;
  const filters = filtersSchema.parse({
    specialty: emptyToUndefined(firstValue(rawParams.specialty)),
    name: emptyToUndefined(firstValue(rawParams.name)),
    city: emptyToUndefined(firstValue(rawParams.city)),
    facility: emptyToUndefined(firstValue(rawParams.facility)) as "CLINIC" | "HOSPITAL" | undefined,
  });

  // Where the patient is searching from. `lat`/`lng` come from the browser
  // (already coarsened before they were put in the URL); `near` is text
  // they typed instead. Coordinates win when both are present — see
  // NearMeSearch for the matching client-side rule.
  const location = parseLocationSearchParams({
    lat: firstValue(rawParams.lat),
    lng: firstValue(rawParams.lng),
    near: firstValue(rawParams.near),
    radiusKm: firstValue(rawParams.radiusKm) ?? firstValue(rawParams.radius),
  });

  // Anchors are loaded once and used for two things: resolving what the
  // patient typed, and suggesting places they could type.
  const anchors = await loadLocationAnchors();
  const matchedAnchor = location.origin === null && location.near ? resolveLocationAnchor(location.near, anchors) : null;
  const origin = location.origin ?? (matchedAnchor ? { latitude: matchedAnchor.latitude, longitude: matchedAnchor.longitude } : null);
  // The patient asked for somewhere we have never listed a facility. Not
  // an error — the page falls back to the unsorted listing and says so.
  const unmatchedPlace = location.origin === null && location.near !== null && matchedAnchor === null;

  // In location mode the city text filter is deliberately not applied:
  // "within 5 km of me" and "in a place whose name contains Pune" are two
  // answers to the same question, and applying both would hide the clinic
  // two streets away that happens to sit in the next locality.
  const listingFilters: Filters = origin ? { ...filters, city: undefined } : filters;

  const requestedPage = parsePage(firstValue(rawParams.page));
  const refineFilters = parseDiscoveryFilters(rawParams);
  const sort = parseDoctorSort(rawParams, origin !== null);
  const refineWhere = buildDiscoveryFilterWhere(refineFilters, new Date());
  const refineFacilityWhere = buildFacilityFilterWhere(refineFilters, new Date());

  const [doctorPage, specialtyGroups, cityRows, clinicDoctorCount, hospitalDoctorCount] = await Promise.all([
    loadDoctors(listingFilters, origin, location.radiusKm, requestedPage, sort, refineWhere),
    // Browse-by-specialty, generated from what is actually listed (with a
    // real count per specialty) rather than a fixed editorial taxonomy —
    // a hardcoded list would advertise specialties no doctor here has.
    prisma.doctor.groupBy({
      by: ["specialty"],
      where: buildDoctorDiscoveryWhere({}),
      _count: { _all: true },
      orderBy: { specialty: "asc" },
    }),
    prisma.clinic.findMany({
      where: { ...LISTED_CLINIC, doctors: { some: { isActive: true } } },
      distinct: ["city"],
      select: { city: true },
      orderBy: { city: "asc" },
    }),
    // Doctor counts per facility type. Counting doctors (not facilities)
    // because that is what the list below shows — a "Hospitals 0" chip
    // that still had hospitals but no listed doctors would be misleading.
    prisma.doctor.count({ where: buildDoctorDiscoveryWhere({ facility: "CLINIC" }) }),
    prisma.doctor.count({ where: buildDoctorDiscoveryWhere({ facility: "HOSPITAL" }) }),
  ]);

  const doctorResults = doctorPage.results;
  const pageInfo = doctorPage.info;
  // The rows on THIS page; the total across all pages is pageInfo.total.
  const doctors = doctorResults.map((result) => result.doctor);

  // "Next available" per doctor — the soonest session still ahead of us,
  // fetched in one query for every doctor on the page rather than N+1.
  // Filtered on plannedEndAt (not sessionDate) for the same reason the
  // doctor profile page does: sessionDate is a date-only marker.
  const upcomingSessions =
    doctors.length > 0
      ? await prisma.session.findMany({
          where: {
            doctorId: { in: doctors.map((d) => d.id) },
            status: { in: ["SCHEDULED", "OPEN", "IN_PROGRESS"] },
            plannedEndAt: { gte: new Date() },
          },
          orderBy: { plannedStartAt: "asc" },
        })
      : [];
  const nextSessionByDoctor = new Map<string, (typeof upcomingSessions)[number]>();
  for (const session of upcomingSessions) {
    if (!nextSessionByDoctor.has(session.doctorId)) nextSessionByDoctor.set(session.doctorId, session);
  }

  const cities = cityRows.map((row) => row.city);
  const hasFilters =
    Boolean(filters.name || filters.specialty || filters.city || filters.facility) ||
    hasAnyDiscoveryFilter(refineFilters);
  const hasLocation = origin !== null;

  // Filters that survive a location search, so using "Search near you"
  // from a filtered list doesn't silently throw the filters away.
  const preservedFilters: Record<string, string> = {};
  if (filters.specialty) preservedFilters.specialty = filters.specialty;
  if (filters.name) preservedFilters.name = filters.name;
  if (filters.facility) preservedFilters.facility = filters.facility;

  // Tab counts reflect the filters in play, so switching to Hospitals
  // never lands on an empty page the tab promised results for. The doctors
  // count is handed in rather than re-queried — this page just computed it.
  const counts = await loadDiscoveryCounts(
    { filters: listingFilters, origin, radiusKm: location.radiusKm, extraWhere: refineWhere, extraFacilityWhere: refineFacilityWhere },
    { doctors: pageInfo.total },
  );

  // Only filters that mean the same thing on every tab survive a tab
  // switch. `name` does not: it is a doctor's name here and a facility's
  // name on /clinics.
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

  // One pin per FACILITY, not per doctor: several doctors at the same
  // clinic would otherwise stack identical pins on one point, and the badge
  // count is more useful than a pile.
  const clinicsOnPage = new Map<string, { clinic: (typeof doctors)[number]["clinic"]; doctors: number }>();
  for (const doctor of doctors) {
    const existing = clinicsOnPage.get(doctor.clinicId);
    if (existing) existing.doctors += 1;
    else clinicsOnPage.set(doctor.clinicId, { clinic: doctor.clinic, doctors: 1 });
  }
  const mapMarkers: MapMarker[] = [...clinicsOnPage.values()].flatMap(({ clinic, doctors: count }) =>
    clinic.latitude === null || clinic.longitude === null
      ? []
      : [
          {
            key: clinic.id,
            latitude: clinic.latitude,
            longitude: clinic.longitude,
            label: `${clinic.name} — ${count} ${count === 1 ? "doctor" : "doctors"} on this page`,
            href: `/facilities/${clinic.slug}`,
            badge: String(count),
          },
        ],
  );

  const suggestions = anchors.slice(0, MAX_PLACE_SUGGESTIONS).map((anchor) => anchor.label);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Find the right doctor</h1>
            <p className="text-base text-muted">
              Search verified doctors near you, see when they&apos;re next available, and book a digital token.
            </p>
          </div>

          <DiscoveryTabs active="doctors" counts={counts} carriedParams={carriedParams} />

          <NearMeSearch
            basePath="/doctors"
            preservedFilters={preservedFilters}
            radiusKm={location.radiusKm}
            deviceOrigin={location.origin}
            nearQuery={location.near ?? ""}
            matchedPlaceLabel={matchedAnchor?.label ?? null}
            suggestions={suggestions}
          />

          {unmatchedPlace && (
            <Alert variant="warning">
              We don&apos;t have any listed facilities matching &ldquo;{location.near}&rdquo; yet, so results below
              aren&apos;t sorted by distance. Try a nearby city, or search by name or specialty.
            </Alert>
          )}

          <DiscoverySearchForm
            action="/doctors"
            namePlaceholder="Doctor name"
            specialtyPlaceholder="Specialty"
            nameValue={filters.name}
            specialtyValue={filters.specialty}
            cityValue={filters.city}
            hasLocation={hasLocation}
            origin={location.origin}
            near={location.near}
            radiusKm={location.radiusKm}
            hiddenFields={filters.facility ? { facility: filters.facility } : undefined}
          />
        </div>

        {/* "Practising at" rather than "Clinics or hospitals": the tabs
            above now switch what you are browsing, so this row has to read
            unmistakably as a filter on doctors. Only worth showing when
            both kinds actually exist — a lone chip filters nothing. */}
        {clinicDoctorCount > 0 && hospitalDoctorCount > 0 && (
          <FilterChipGroup
            heading="Practising at"
            basePath="/doctors"
            params={rawParams}
            paramKey="facility"
            activeValue={filters.facility}
            options={[
              { value: "CLINIC", label: "A clinic", count: clinicDoctorCount },
              { value: "HOSPITAL", label: "A hospital", count: hospitalDoctorCount },
            ]}
          />
        )}

        <FilterChipGroup
          heading="Browse by specialty"
          basePath="/doctors"
          params={rawParams}
          paramKey="specialty"
          activeValue={filters.specialty}
          options={specialtyGroups.map((group) => ({
            value: group.specialty,
            label: group.specialty,
            count: group._count._all,
          }))}
        />

        {/* Hidden during a location search: "browse by city" and "within
            5 km of here" are competing answers to the same question, and
            a city chip would silently drop the location. */}
        {!hasLocation && cities.length > 1 && (
          <FilterChipGroup
            heading="Browse by city"
            basePath="/doctors"
            params={rawParams}
            paramKey="city"
            activeValue={filters.city}
            options={cities.map((city) => ({ value: city, label: city }))}
          />
        )}

        <DiscoveryControls
          basePath="/doctors"
          params={rawParams}
          filters={refineFilters}
          sort={sort}
          hasLocation={hasLocation}
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {pageInfo.total} {pageInfo.total === 1 ? "doctor" : "doctors"}
              {hasLocation ? ` within ${location.radiusKm} km` : hasFilters ? " matching" : " listed"}
            </h2>
            {(hasFilters || hasLocation) && (
              <Link href="/doctors" className="text-sm text-primary underline underline-offset-2">
                Clear filters
              </Link>
            )}
          </div>

          {mapMarkers.length > 0 && <StaticMap markers={mapMarkers} viewerOrigin={origin} />}

          {doctors.length === 0 ? (
            <NoResults
              basePath="/doctors"
              params={rawParams}
              plural="doctors"
              hasLocation={hasLocation}
              hasFilters={hasFilters}
              radiusKm={location.radiusKm}
                        />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {doctorResults.map(({ doctor, distanceKm }) => {
                const next = nextSessionByDoctor.get(doctor.id);
                return (
                  <li key={doctor.id}>
                    <DiscoveryCard
                      href={`/doctors/${doctor.slug}`}
                      title={doctor.name}
                      titleAdornment={
                        doctor.verificationStatus === "VERIFIED" ? (
                          <VerificationStatusBadge status={doctor.verificationStatus} />
                        ) : null
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
                      <div className="flex gap-3">
                        <Avatar name={doctor.name} photoUrl={doctor.photoUrl} size={56} className="shrink-0" />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-medium text-primary">{doctor.specialty}</span>
                          <span className="truncate text-xs text-muted">{doctor.qualificationText}</span>
                          {doctor.experienceYears != null && (
                            <span className="text-xs text-muted">{doctor.experienceYears} years experience</span>
                          )}
                          {doctor.consultationFeeMinor != null && (
                            <span className="text-xs text-muted">
                              {formatFeeMinor(doctor.consultationFeeMinor)} consultation
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-0.5 text-sm text-muted">
                        {/* Reachable in its own right now that the card is
                            no longer one giant link — a patient who likes
                            the facility can go straight to it. */}
                        <CardAction>
                          <Link
                            href={`/facilities/${doctor.clinic.slug}`}
                            className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
                          >
                            {doctor.clinic.name}
                          </Link>
                          {doctor.clinic.facilityType === "HOSPITAL" && (
                            <span className="text-muted"> · Hospital</span>
                          )}
                        </CardAction>
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span>
                            {doctor.clinic.areaLabel ? `${doctor.clinic.areaLabel}, ` : ""}
                            {doctor.clinic.city}
                          </span>
                          {distanceKm !== null && (
                            <span className="font-medium text-foreground">{formatDistanceKm(distanceKm)} away</span>
                          )}
                        </span>
                      </div>
                    </DiscoveryCard>
                  </li>
                );
              })}
            </ul>
          )}

          <Pagination basePath="/doctors" params={rawParams} info={pageInfo} itemLabel="doctors" />
        </div>
      </main>
      <Footer />
    </>
  );
}

type DoctorWithClinic = Awaited<ReturnType<typeof findNearbyDoctors>>[number]["item"];

interface DiscoveryResult {
  doctor: DoctorWithClinic;
  /** Null whenever the patient has not given us anywhere to measure from. */
  distanceKm: number | null;
}

/**
 * Two listings, one shape. With a location the rows come back nearest
 * first; without one they keep the original ranking — verified doctors
 * first, then alphabetical.
 */
interface DoctorPage {
  results: DiscoveryResult[];
  info: ReturnType<typeof buildPageInfo>;
}

/**
 * One page of doctors, in whichever order was asked for.
 *
 * Four shapes, because the orderings come from four different places:
 *
 *   distance   — haversine, computed in application code, so the candidate
 *                set is ranked then sliced
 *   soonest    — MIN(session.plannedStartAt) per doctor, which is a related
 *                aggregate Prisma cannot order a findMany by, so the order
 *                is established with a groupBy and the page is windowed
 *                over the resulting id list
 *   match      — verified first, then alphabetical; two ordered queries
 *                concatenated (see splitAcrossGroups for why)
 *   fee / experience — a plain ORDER BY
 */
async function loadDoctors(
  filters: Filters,
  origin: { latitude: number; longitude: number } | null,
  radiusKm: number,
  requestedPage: number,
  sort: DoctorSort,
  extraWhere: Prisma.DoctorWhereInput,
): Promise<DoctorPage> {
  if (sort === "distance" && origin) {
    const nearby = await findNearbyDoctors({ origin, radiusKm, filters, extraWhere });
    const info = buildPageInfo(requestedPage, nearby.length);
    return {
      info,
      results: nearby
        .slice(info.skip, info.skip + info.pageSize)
        .map(({ item, distanceKm }) => ({ doctor: item, distanceKm })),
    };
  }

  // A non-distance sort with a location active still has to respect the
  // radius: the patient asked for cheapest NEAR THEM, not cheapest anywhere.
  // The radius is applied by collecting the in-range ids first, then
  // ordering that set the way they asked.
  let radiusIds: string[] | null = null;
  const distanceById = new Map<string, number>();
  if (origin) {
    const nearby = await findNearbyDoctors({ origin, radiusKm, filters, extraWhere });
    radiusIds = nearby.map(({ item }) => item.id);
    for (const { item, distanceKm } of nearby) distanceById.set(item.id, distanceKm);
    if (radiusIds.length === 0) {
      return { info: buildPageInfo(requestedPage, 0), results: [] };
    }
  }

  const where: Prisma.DoctorWhereInput = {
    ...buildDoctorDiscoveryWhere(filters),
    ...extraWhere,
    ...(radiusIds ? { id: { in: radiusIds } } : {}),
  };

  const withDistance = (doctors: DoctorWithClinic[]): DiscoveryResult[] =>
    doctors.map((doctor) => ({ doctor, distanceKm: distanceById.get(doctor.id) ?? null }));

  if (sort === "soonest") {
    // Doctors WITH an upcoming session, ordered by how soon it is, then
    // everyone else alphabetically behind them. groupBy gives the earliest
    // session per doctor in one query.
    const upcoming = await prisma.session.groupBy({
      by: ["doctorId"],
      where: { doctor: where, status: { in: ["SCHEDULED", "OPEN", "IN_PROGRESS"] }, plannedEndAt: { gte: new Date() } },
      _min: { plannedStartAt: true },
    });
    const orderedIds = [...upcoming]
      .sort((a, b) => (a._min.plannedStartAt?.getTime() ?? 0) - (b._min.plannedStartAt?.getTime() ?? 0))
      .map((row) => row.doctorId);

    const withSession = new Set(orderedIds);
    const total = await prisma.doctor.count({ where });
    const info = buildPageInfo(requestedPage, total);
    const { first, second } = splitAcrossGroups(info.skip, info.pageSize, orderedIds.length);

    const pageIds = orderedIds.slice(first.skip, first.skip + first.take);
    const [scheduled, unscheduled] = await Promise.all([
      pageIds.length > 0
        ? prisma.doctor.findMany({ where: { id: { in: pageIds } }, include: { clinic: true } })
        : Promise.resolve([]),
      second.take > 0
        ? prisma.doctor.findMany({
            where: { ...where, ...(withSession.size > 0 ? { id: { notIn: [...withSession] } } : {}) },
            include: { clinic: true },
            orderBy: { name: "asc" },
            skip: second.skip,
            take: second.take,
          })
        : Promise.resolve([]),
    ]);

    // findMany does not preserve the order of an `in` list, so the
    // soonest-first ordering is reapplied here.
    const byId = new Map(scheduled.map((doctor) => [doctor.id, doctor]));
    const ordered = pageIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    return { info, results: withDistance([...ordered, ...unscheduled]) };
  }

  if (!usesVerifiedRanking(sort)) {
    const total = await prisma.doctor.count({ where });
    const info = buildPageInfo(requestedPage, total);
    const doctors = await prisma.doctor.findMany({
      where,
      include: { clinic: true },
      orderBy: doctorOrderBy(sort) ?? [{ name: "asc" }],
      skip: info.skip,
      take: info.pageSize,
    });
    return { info, results: withDistance(doctors) };
  }

  // Best match: verified doctors first, then alphabetical. Postgres sorts
  // an enum by declaration order (PENDING, VERIFIED, REJECTED) and would
  // rank unverified doctors first, so this is two ordered queries.
  const verifiedWhere = { ...where, verificationStatus: "VERIFIED" as const };
  const unverifiedWhere = { ...where, NOT: { verificationStatus: "VERIFIED" as const } };

  const [verifiedTotal, unverifiedTotal] = await Promise.all([
    prisma.doctor.count({ where: verifiedWhere }),
    prisma.doctor.count({ where: unverifiedWhere }),
  ]);

  const info = buildPageInfo(requestedPage, verifiedTotal + unverifiedTotal);
  const { first, second } = splitAcrossGroups(info.skip, info.pageSize, verifiedTotal);

  const [verified, unverified] = await Promise.all([
    first.take > 0
      ? prisma.doctor.findMany({
          where: verifiedWhere,
          include: { clinic: true },
          orderBy: { name: "asc" },
          skip: first.skip,
          take: first.take,
        })
      : Promise.resolve([]),
    second.take > 0
      ? prisma.doctor.findMany({
          where: unverifiedWhere,
          include: { clinic: true },
          orderBy: { name: "asc" },
          skip: second.skip,
          take: second.take,
        })
      : Promise.resolve([]),
  ]);

  return { info, results: withDistance([...verified, ...unverified]) };
}
