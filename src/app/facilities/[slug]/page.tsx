import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { Avatar } from "@/components/ui/Avatar";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { StaticMap } from "@/components/discovery/StaticMap";
import {
  DistanceFromViewer,
  ShowDistancesButton,
  ViewerLocationProvider,
} from "@/components/discovery/ViewerLocation";
import { formatClinicDateWithWeekday, formatClinicTime, formatFeeMinor } from "@/lib/format";
import { LISTED_CLINIC } from "@/lib/publicListing";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, facilitySchema } from "@/lib/seo/structuredData";

// The public page for a clinic or hospital — the facility-side counterpart
// of /doctors/[slug].
//
// One route for both kinds, because they are one model: a hospital is a
// Clinic row with facilityType HOSPITAL. The two discovery *lists* are
// separate (/clinics and /hospitals) because they answer different
// questions, but a facility that is re-typed from clinic to hospital must
// not have its public URL break underneath it, which two detail routes
// would guarantee.
//
// Reached by slug, never by id: internal IDs never go into public URLs.

interface FacilityPageProps {
  params: Promise<{ slug: string }>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

// Shared by generateMetadata and the page so the facility is read once.
// A large hospital can list hundreds of doctors. The profile shows the
// first page of them and links onward to /doctors, which is the surface
// built for searching and paging through a list that size.
const MAX_PROFILE_DOCTORS = 24;

const loadFacilityForSeo = cache(async (slug: string) =>
  prisma.clinic.findFirst({
    where: { slug, ...LISTED_CLINIC },
    include: {
      doctors: { where: { isActive: true }, orderBy: { name: "asc" }, take: MAX_PROFILE_DOCTORS },
      _count: { select: { doctors: { where: { isActive: true } } } },
    },
  }),
);

export async function generateMetadata({ params }: FacilityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const clinic = await loadFacilityForSeo(slug);
  if (!clinic) return { title: "Facility not found", robots: { index: false, follow: false } };

  const kind = clinic.facilityType === "HOSPITAL" ? "Hospital" : "Clinic";
  const where = [clinic.areaLabel, clinic.city].filter(Boolean).join(", ");
  const specialties = [...new Set(clinic.doctors.map((doctor) => doctor.specialty))].sort((a, b) =>
    a.localeCompare(b),
  );

  const title = `${clinic.name} — ${kind} in ${where}`;
  const description = [
    `${clinic.name} is a ${kind.toLowerCase()} in ${where}, ${clinic.state}.`,
    clinic._count.doctors > 0
      ? `${clinic._count.doctors} ${clinic._count.doctors === 1 ? "doctor" : "doctors"}${
          specialties.length > 0 ? ` across ${specialties.slice(0, 4).join(", ")}` : ""
        }.`
      : null,
    "Book a digital OPD token and track the live queue on ApnaHealth.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    description,
    alternates: { canonical: `/facilities/${clinic.slug}` },
    openGraph: { type: "website", title, description, url: `/facilities/${clinic.slug}` },
  };
}

export default async function FacilityProfilePage({ params }: FacilityPageProps) {
  const { slug } = await params;

  // LISTED_CLINIC, not a bare slug lookup: a pending or rejected facility
  // has a slug too, and it must 404 here exactly as it is absent from
  // search. This is the same gate every other public read applies.
  const clinic = await loadFacilityForSeo(slug);

  if (!clinic) {
    notFound();
  }

  const doctorIds = clinic.doctors.map((doctor) => doctor.id);

  const upcomingSessions =
    doctorIds.length > 0
      ? await prisma.session.findMany({
          where: {
            clinicId: clinic.id,
            doctorId: { in: doctorIds },
            status: { in: ["SCHEDULED", "OPEN", "IN_PROGRESS"] },
            plannedEndAt: { gte: new Date() },
          },
          orderBy: { plannedStartAt: "asc" },
          include: { doctor: { select: { name: true, slug: true, specialty: true } } },
          take: 20,
        })
      : [];

  const nextSessionByDoctor = new Map<string, (typeof upcomingSessions)[number]>();
  for (const session of upcomingSessions) {
    if (!nextSessionByDoctor.has(session.doctorId)) nextSessionByDoctor.set(session.doctorId, session);
  }

  const specialties = [...new Set(clinic.doctors.map((doctor) => doctor.specialty))].sort((a, b) =>
    a.localeCompare(b),
  );
  const verifiedCount = clinic.doctors.filter((doctor) => doctor.verificationStatus === "VERIFIED").length;
  const totalDoctors = clinic._count.doctors;
  const hasMoreDoctors = totalDoctors > clinic.doctors.length;
  const isHospital = clinic.facilityType === "HOSPITAL";

  const mapsQuery = encodeURIComponent(`${clinic.name}, ${clinic.addressLine}, ${clinic.city}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <>
      <JsonLd
        data={[
          facilitySchema(clinic, specialties),
          breadcrumbSchema([
            { name: isHospital ? "Hospitals" : "Clinics", path: isHospital ? "/hospitals" : "/clinics" },
            { name: clinic.name, path: `/facilities/${clinic.slug}` },
          ]),
        ]}
      />
      <SiteHeader />
      <ViewerLocationProvider>
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
          <Link
            href={isHospital ? "/hospitals" : "/clinics"}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-primary"
          >
            &larr; Back to {isHospital ? "hospitals" : "clinics"}
          </Link>

          <Card className="flex flex-col gap-6 p-6 sm:p-8">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{clinic.name}</h1>
                <Badge variant={isHospital ? "info" : "neutral"}>{isHospital ? "Hospital" : "Clinic"}</Badge>
              </div>
              <p className="text-sm text-muted">
                {clinic.addressLine}
                {clinic.areaLabel ? `, ${clinic.areaLabel}` : ""}, {clinic.city}, {clinic.state}
                {clinic.postalCode ? ` - ${clinic.postalCode}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <span>📍 Open in Google Maps</span>
                </a>
                <a href={`tel:${clinic.phone}`} className="text-xs font-semibold text-primary hover:underline">
                  {clinic.phone}
                </a>
              </div>
              {/* Measured in the browser against this facility's published
                  coordinates — the patient's position is never sent. */}
              {clinic.latitude !== null && clinic.longitude !== null && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <ShowDistancesButton label="How far is this from me?" />
                  <DistanceFromViewer
                    latitude={clinic.latitude}
                    longitude={clinic.longitude}
                    className="text-sm font-semibold text-foreground"
                  />
                </div>
              )}
            </div>

            {clinic.latitude !== null && clinic.longitude !== null && (
              <StaticMap
                markers={[
                  {
                    key: clinic.id,
                    latitude: clinic.latitude,
                    longitude: clinic.longitude,
                    label: clinic.name,
                    href: mapsUrl,
                  },
                ]}
                height={220}
              />
            )}

            <dl className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
              <Fact label="Doctors" value={String(totalDoctors)} />
              <Fact label="Verified" value={String(verifiedCount)} />
              <Fact label={isHospital ? "Departments" : "Specialities"} value={String(specialties.length)} />
              <Fact label="Upcoming sessions" value={String(upcomingSessions.length)} />
            </dl>

            {specialties.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {isHospital ? "Departments" : "Specialities"}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {specialties.map((specialty) => (
                    <Link
                      key={specialty}
                      href={`/doctors?specialty=${encodeURIComponent(specialty)}`}
                      className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {specialty}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Doctors at this facility</h2>
              <p className="text-xs text-muted">Open a doctor&apos;s profile to see their sessions and book a token.</p>
            </div>

            {clinic.doctors.length === 0 ? (
              <EmptyState
                title="No doctors listed here yet"
                description="This facility hasn't published any doctor profiles. Try another facility nearby."
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {clinic.doctors.map((doctor) => {
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
                          next ? (
                            <span className="flex items-center gap-1.5 font-semibold text-success">
                              <span className="h-2 w-2 rounded-full bg-success"></span>
                              Next: {formatClinicDateWithWeekday(next.sessionDate)},{" "}
                              {formatClinicTime(next.plannedStartAt)}
                            </span>
                          ) : (
                            <span className="text-muted">No upcoming sessions</span>
                          )
                        }
                      >
                        <div className="flex gap-3">
                          <Avatar name={doctor.name} photoUrl={doctor.photoUrl} size={56} className="shrink-0" />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium text-primary">{doctor.specialty}</span>
                            <span className="truncate text-xs text-muted">{doctor.qualificationText}</span>
                            {doctor.consultationFeeMinor != null && (
                              <span className="text-xs text-muted">
                                {formatFeeMinor(doctor.consultationFeeMinor)} consultation
                              </span>
                            )}
                          </div>
                        </div>
                      </DiscoveryCard>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasMoreDoctors && (
              <Link
                href={`/doctors?city=${encodeURIComponent(clinic.city)}`}
                className="inline-flex w-fit items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Showing {clinic.doctors.length} of {totalDoctors} doctors — search them all &rarr;
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Upcoming sessions</h2>
            {upcomingSessions.length === 0 ? (
              <EmptyState
                title="No upcoming sessions scheduled"
                description="New session slots are announced regularly. Please check back soon."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {upcomingSessions.map((session) => {
                  const bookable = session.status === "OPEN" || session.status === "IN_PROGRESS";
                  return (
                    <li key={session.id}>
                      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-base font-bold text-foreground">
                              {formatClinicDateWithWeekday(session.sessionDate)}
                            </span>
                            {session.status === "IN_PROGRESS" && <Badge variant="warning">In progress</Badge>}
                            {session.status === "OPEN" && <Badge variant="success">Open for booking</Badge>}
                            {session.status === "SCHEDULED" && <Badge variant="neutral">Scheduled</Badge>}
                          </div>
                          <div className="text-sm font-medium text-foreground">
                            {formatClinicTime(session.plannedStartAt)} – {formatClinicTime(session.plannedEndAt)}
                          </div>
                          <div className="text-xs text-muted">
                            {session.doctor.name} · {session.doctor.specialty} · {session.locationLabel}
                          </div>
                        </div>
                        {bookable ? (
                          <Link
                            href={`/book/${session.publicId}`}
                            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            Book Digital Token
                          </Link>
                        ) : (
                          <span className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
                            Bookings open soon
                          </span>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </main>
      </ViewerLocationProvider>
      <Footer />
    </>
  );
}
