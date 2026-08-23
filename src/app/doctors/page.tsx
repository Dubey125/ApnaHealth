import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/components/ui/cn";
import { formatClinicDate, formatClinicTime, formatFeeMinor } from "@/lib/format";

const filtersSchema = z.object({
  specialty: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  // Matched against city OR areaLabel, so "Pune" and "Koregaon Park" both
  // work from the same box rather than forcing the patient to know which
  // level of granularity the clinic happened to record.
  city: z.string().trim().min(1).optional(),
  facility: z.enum(["CLINIC", "HOSPITAL"]).optional(),
});

interface DoctorsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export default async function DoctorsPage({ searchParams }: DoctorsPageProps) {
  const rawParams = await searchParams;
  const filters = filtersSchema.parse({
    specialty: firstValue(rawParams.specialty),
    name: firstValue(rawParams.name),
    city: firstValue(rawParams.city),
    facility: firstValue(rawParams.facility),
  });
  const hasFilters = Boolean(filters.name || filters.specialty || filters.city || filters.facility);

  const locationWhere = filters.city
    ? {
        OR: [
          { city: { contains: filters.city, mode: "insensitive" as const } },
          { areaLabel: { contains: filters.city, mode: "insensitive" as const } },
        ],
      }
    : {};

  const listedDoctorWhere = { isActive: true, clinic: { isActive: true } } as const;

  const [doctors, specialtyGroups, cityRows, clinicDoctorCount, hospitalDoctorCount] = await Promise.all([
    prisma.doctor.findMany({
      where: {
        ...listedDoctorWhere,
        clinic: {
          isActive: true,
          ...(filters.facility ? { facilityType: filters.facility } : {}),
          ...locationWhere,
        },
        ...(filters.specialty ? { specialty: { contains: filters.specialty, mode: "insensitive" } } : {}),
        ...(filters.name ? { name: { contains: filters.name, mode: "insensitive" } } : {}),
      },
      include: { clinic: true },
      orderBy: { name: "asc" },
    }),
    // Browse-by-specialty, generated from what is actually listed (with a
    // real count per specialty) rather than a fixed editorial taxonomy —
    // a hardcoded list would advertise specialties no doctor here has.
    prisma.doctor.groupBy({
      by: ["specialty"],
      where: listedDoctorWhere,
      _count: { _all: true },
      orderBy: { specialty: "asc" },
    }),
    prisma.clinic.findMany({
      where: { isActive: true, doctors: { some: { isActive: true } } },
      distinct: ["city"],
      select: { city: true },
      orderBy: { city: "asc" },
    }),
    // Doctor counts per facility type. Counting doctors (not facilities)
    // because that is what the list below shows — a "Hospitals 0" chip
    // that still had hospitals but no listed doctors would be misleading.
    prisma.doctor.count({ where: { isActive: true, clinic: { isActive: true, facilityType: "CLINIC" } } }),
    prisma.doctor.count({ where: { isActive: true, clinic: { isActive: true, facilityType: "HOSPITAL" } } }),
  ]);

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

  // Verified doctors rank first, then alphabetical. Done here rather than
  // as an `orderBy: { verificationStatus }`: Postgres sorts an enum by its
  // declaration order (PENDING, VERIFIED, REJECTED), which would rank
  // unverified doctors above verified ones — the opposite of what a
  // patient scanning this list wants.
  const rankedDoctors = [...doctors].sort((a, b) => {
    const aVerified = a.verificationStatus === "VERIFIED" ? 0 : 1;
    const bVerified = b.verificationStatus === "VERIFIED" ? 0 : 1;
    return aVerified - bVerified || a.name.localeCompare(b.name);
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Find the right doctor</h1>
            <p className="text-base text-muted">
              Search verified doctors, see when they&apos;re next available, and book a digital token.
            </p>
          </div>

          <form method="GET" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
            <Input name="name" defaultValue={filters.name} placeholder="Doctor name" className="sm:flex-1" />
            <Input name="specialty" defaultValue={filters.specialty} placeholder="Specialty" className="sm:flex-1" />
            <Input name="city" defaultValue={filters.city} placeholder="City or area" className="sm:w-44" />
            {filters.facility && <input type="hidden" name="facility" value={filters.facility} />}
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Search
            </button>
          </form>
        </div>

        {/* Only worth showing when both kinds actually exist — a lone
            "Clinics" chip filters nothing. */}
        {clinicDoctorCount > 0 && hospitalDoctorCount > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Clinics or hospitals</h2>
            <div className="flex flex-wrap gap-2">
              {([
                ["CLINIC", "Clinics", clinicDoctorCount],
                ["HOSPITAL", "Hospitals", hospitalDoctorCount],
              ] as const).map(([value, label, count]) => {
                const active = filters.facility === value;
                return (
                  <FilterChip key={value} active={active} href={active ? "/doctors" : `/doctors?facility=${value}`}>
                    {label}
                    <span className={cn("tabular-nums", active ? "text-primary-foreground/70" : "text-muted/70")}>
                      {count}
                    </span>
                  </FilterChip>
                );
              })}
            </div>
          </div>
        )}

        {specialtyGroups.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Browse by specialty</h2>
            <div className="flex flex-wrap gap-2">
              {specialtyGroups.map((group) => {
                const active = filters.specialty?.toLowerCase() === group.specialty.toLowerCase();
                return (
                  <FilterChip
                    key={group.specialty}
                    active={active}
                    href={active ? "/doctors" : `/doctors?specialty=${encodeURIComponent(group.specialty)}`}
                  >
                    {group.specialty}
                    <span className={cn("tabular-nums", active ? "text-primary-foreground/70" : "text-muted/70")}>
                      {group._count._all}
                    </span>
                  </FilterChip>
                );
              })}
            </div>
          </div>
        )}

        {cities.length > 1 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Browse by city</h2>
            <div className="flex flex-wrap gap-2">
              {cities.map((city) => {
                const active = filters.city?.toLowerCase() === city.toLowerCase();
                return (
                  <FilterChip key={city} active={active} href={active ? "/doctors" : `/doctors?city=${encodeURIComponent(city)}`}>
                    {city}
                  </FilterChip>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {doctors.length} {doctors.length === 1 ? "doctor" : "doctors"}
              {hasFilters ? " matching" : " listed"}
            </h2>
            {hasFilters && (
              <Link href="/doctors" className="text-sm text-primary underline underline-offset-2">
                Clear filters
              </Link>
            )}
          </div>

          {doctors.length === 0 ? (
            <EmptyState
              title="No doctors match those filters"
              description={hasFilters ? "Try a different name, specialty or city." : "No doctors are listed yet."}
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {rankedDoctors.map((doctor) => {
                const next = nextSessionByDoctor.get(doctor.id);
                return (
                  <li key={doctor.id}>
                    <Link href={`/doctors/${doctor.slug}`} className="block h-full">
                      <Card className="flex h-full flex-col gap-3 transition-colors hover:border-primary/40">
                        <div className="flex gap-3">
                          <Avatar name={doctor.name} photoUrl={doctor.photoUrl} size={56} className="shrink-0" />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-foreground">{doctor.name}</span>
                              {doctor.verificationStatus === "VERIFIED" && (
                                <VerificationStatusBadge status={doctor.verificationStatus} />
                              )}
                            </div>
                            <span className="text-sm font-medium text-primary">{doctor.specialty}</span>
                            <span className="truncate text-xs text-muted">{doctor.qualificationText}</span>
                            {doctor.experienceYears != null && (
                              <span className="text-xs text-muted">{doctor.experienceYears} years experience</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-0.5 text-sm text-muted">
                          <span>
                            {doctor.clinic.name}
                            {doctor.clinic.facilityType === "HOSPITAL" && " · Hospital"}
                          </span>
                          <span>
                            {doctor.clinic.areaLabel ? `${doctor.clinic.areaLabel}, ` : ""}
                            {doctor.clinic.city}
                          </span>
                          {doctor.consultationFeeMinor != null && (
                            <span>{formatFeeMinor(doctor.consultationFeeMinor)} consultation</span>
                          )}
                        </div>

                        <div className="mt-auto border-t border-border pt-3 text-sm">
                          {next ? (
                            <span className="font-medium text-success">
                              Next: {formatClinicDate(next.sessionDate)}, {formatClinicTime(next.plannedStartAt)}
                            </span>
                          ) : (
                            <span className="text-muted">No upcoming sessions</span>
                          )}
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
