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
import { formatClinicDateWithWeekday, formatClinicTime, formatFeeMinor } from "@/lib/format";
import { LISTED_DOCTOR } from "@/lib/publicListing";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, doctorSchema } from "@/lib/seo/structuredData";
import {
  DistanceFromViewer,
  ShowDistancesButton,
  ViewerLocationProvider,
} from "@/components/discovery/ViewerLocation";

interface DoctorProfilePageProps {
  params: Promise<{ slug: string }>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase font-medium tracking-wide text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

// Loaded once per request and reused by generateMetadata and the page
// itself. Next dedupes identical fetches but not identical Prisma calls, so
// without this the profile is read twice for every view.
const loadDoctorForSeo = cache(async (slug: string) =>
  prisma.doctor.findFirst({
    where: { slug, ...LISTED_DOCTOR },
    include: { clinic: true },
  }),
);

export async function generateMetadata({ params }: DoctorProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const doctor = await loadDoctorForSeo(slug);
  // An unlisted or missing doctor still returns metadata here; the page
  // body's notFound() is what produces the 404.
  if (!doctor) return { title: "Doctor not found", robots: { index: false, follow: false } };

  const where = [doctor.clinic.areaLabel, doctor.clinic.city].filter(Boolean).join(", ");
  const title = `${doctor.name} — ${doctor.specialty} in ${doctor.clinic.city}`;
  const description = [
    `${doctor.name}, ${doctor.specialty} (${doctor.qualificationText}) at ${doctor.clinic.name}, ${where}.`,
    doctor.experienceYears != null ? `${doctor.experienceYears} years of experience.` : null,
    "Book a digital OPD token and track the live queue on ApnaHealth.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    description,
    // Canonical points at the slug URL, which is the only address this
    // profile has — nothing here is reachable by internal id.
    alternates: { canonical: `/doctors/${doctor.slug}` },
    // images is deliberately not set: opengraph-image.tsx in this folder
    // generates the card, and naming doctor.photoUrl here would override it
    // with a user-supplied URL of unknown dimensions that social crawlers
    // often reject outright.
    openGraph: {
      type: "profile",
      title,
      description,
      url: `/doctors/${doctor.slug}`,
    },
  };
}

export default async function DoctorProfilePage({ params }: DoctorProfilePageProps) {
  const { slug } = await params;

  const doctor = await loadDoctorForSeo(slug);
  if (!doctor) {
    notFound();
  }

  const latestVerifications = await prisma.doctorVerification.findMany({
    where: { doctorId: doctor.id },
    orderBy: { checkedAt: "desc" },
    take: 1,
  });

  const latestVerification = latestVerifications[0] ?? null;

  const upcomingSessions = await prisma.session.findMany({
    where: {
      doctorId: doctor.id,
      status: { in: ["SCHEDULED", "OPEN", "IN_PROGRESS"] },
      plannedEndAt: { gte: new Date() },
    },
    orderBy: { plannedStartAt: "asc" },
  });

  const bookableIds = upcomingSessions.filter((s) => s.status === "OPEN" || s.status === "IN_PROGRESS").map((s) => s.id);
  const waitingGroups =
    bookableIds.length > 0
      ? await prisma.token.groupBy({
          by: ["sessionId"],
          where: { sessionId: { in: bookableIds }, status: { in: ["BOOKED", "CHECKED_IN"] } },
          _count: { _all: true },
        })
      : [];
  const waitingBySession = new Map(waitingGroups.map((g) => [g.sessionId, g._count._all]));

  // Google Maps navigation query link
  const mapsQuery = encodeURIComponent(`${doctor.clinic.name}, ${doctor.clinic.addressLine}, ${doctor.clinic.city}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <>
      <JsonLd
        data={[
          doctorSchema(doctor),
          breadcrumbSchema([
            { name: "Doctors", path: "/doctors" },
            { name: doctor.specialty, path: `/doctors?specialty=${encodeURIComponent(doctor.specialty)}` },
            { name: doctor.name, path: `/doctors/${doctor.slug}` },
          ]),
        ]}
      />
      <SiteHeader />
      {/* The provider holds the viewer's position in this tab only; the
          distance below is computed in the browser against the clinic's
          published coordinates, so nothing about where the patient is
          reaches the server from this page. */}
      <ViewerLocationProvider>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <Link href="/doctors" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-primary transition-colors">
          &larr; Back to doctor search
        </Link>

        {/* Doctor Header Profile Card */}
        <Card className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Avatar name={doctor.name} photoUrl={doctor.photoUrl} size={96} className="shrink-0 ring-4 ring-primary/10 shadow-sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">{doctor.name}</h1>
                {doctor.verificationStatus === "VERIFIED" && (
                  <VerificationStatusBadge status={doctor.verificationStatus} />
                )}
              </div>
              <p className="text-base font-semibold text-primary">{doctor.specialty}</p>
              <p className="text-sm text-muted">{doctor.qualificationText}</p>
              
              {doctor.registrationNumber && (
                <div className="flex items-center gap-2 text-xs text-muted mt-1">
                  <span className="font-semibold text-foreground">Reg No:</span>
                  <span>{doctor.registrationNumber}</span>
                  {doctor.registrationCouncil && <span>({doctor.registrationCouncil})</span>}
                </div>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
            {doctor.experienceYears != null && <Fact label="Experience" value={`${doctor.experienceYears} Years`} />}
            {doctor.consultationFeeMinor != null && (
              <Fact label="Consultation Fee" value={formatFeeMinor(doctor.consultationFeeMinor)} />
            )}
            {doctor.languagesText && <Fact label="Languages" value={doctor.languagesText} />}
            <Fact label="Avg. Visit Duration" value={`~${doctor.defaultConsultMinutes} mins`} />
          </dl>

          {doctor.bio && (
            <div className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">About Doctor</h3>
              <p className="text-sm text-foreground leading-relaxed">{doctor.bio}</p>
            </div>
          )}

          {latestVerification && (
            <div className="rounded-lg bg-success/5 border border-success/20 p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-success text-base">🛡️</span>
                <span className="text-foreground">
                  Registration Verified via <span className="font-semibold">{latestVerification.sourceName}</span>
                </span>
              </div>
              <span className="text-muted">Checked on {formatClinicDateWithWeekday(latestVerification.checkedAt)}</span>
            </div>
          )}
        </Card>

        {/* Sessions & Bookings Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Upcoming OPD Sessions &amp; Digital Serials</h2>
            <p className="text-xs text-muted">Select an active session to book your digital token.</p>
          </div>

          {upcomingSessions.length === 0 ? (
            <EmptyState
              title="No upcoming sessions scheduled right now"
              description="New session slots are announced regularly. Please check back soon or browse other specialists."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {upcomingSessions.map((session) => {
                const bookable = session.status === "OPEN" || session.status === "IN_PROGRESS";
                const waiting = waitingBySession.get(session.id) ?? 0;
                return (
                  <li key={session.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-4 p-5 hover:border-primary/40 transition-colors">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-base font-bold text-foreground">
                            {formatClinicDateWithWeekday(session.sessionDate)}
                          </span>
                          {session.status === "IN_PROGRESS" && <Badge variant="warning">Consultation In Progress</Badge>}
                          {session.status === "OPEN" && <Badge variant="success">Open for Booking</Badge>}
                          {session.status === "SCHEDULED" && <Badge variant="neutral">Scheduled</Badge>}
                        </div>
                        <div className="text-sm font-medium text-foreground">
                          {formatClinicTime(session.plannedStartAt)} – {formatClinicTime(session.plannedEndAt)}
                        </div>
                        <div className="text-xs text-muted">
                          {doctor.clinic.name} · {session.locationLabel}
                          {doctor.clinic.areaLabel ? ` · ${doctor.clinic.areaLabel}` : ""}, {doctor.clinic.city}
                        </div>
                        {bookable && (
                          <div className="text-xs font-medium text-primary">
                            {waiting === 0 ? "Be the first in line" : `~${waiting} patient${waiting === 1 ? "" : "s"} waiting right now`}
                          </div>
                        )}
                      </div>
                      {bookable ? (
                        <Link
                          href={`/book/${session.publicId}`}
                          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
                        >
                          Book Digital Token
                        </Link>
                      ) : (
                        <span className="text-xs font-medium text-muted bg-surface px-3 py-1.5 rounded border border-border">
                          Bookings Open Soon
                        </span>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Clinic & Facility Info */}
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Clinic &amp; Facility Location</h2>
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link
                  href={`/facilities/${doctor.clinic.slug}`}
                  className="text-base font-bold text-foreground hover:text-primary hover:underline"
                >
                  {doctor.clinic.name}
                </Link>
                {doctor.clinic.facilityType === "HOSPITAL" && <Badge variant="info">Hospital</Badge>}
              </div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>📍 Open in Google Maps</span>
              </a>
            </div>
            <p className="text-sm text-muted">
              {doctor.clinic.addressLine}
              {doctor.clinic.areaLabel ? `, ${doctor.clinic.areaLabel}` : ""}, {doctor.clinic.city},{" "}
              {doctor.clinic.state}
              {doctor.clinic.postalCode ? ` - ${doctor.clinic.postalCode}` : ""}
            </p>
            {/* Only offered for a facility that has actually been
                geocoded — a button that can only ever answer "nothing" is
                worse than no button. */}
            {doctor.clinic.latitude !== null && doctor.clinic.longitude !== null && (
              <div className="flex flex-wrap items-center gap-3">
                <ShowDistancesButton label="How far is this from me?" />
                <DistanceFromViewer
                  latitude={doctor.clinic.latitude}
                  longitude={doctor.clinic.longitude}
                  className="text-sm font-semibold text-foreground"
                />
              </div>
            )}
            <div className="flex items-center gap-4 text-xs pt-1 border-t border-border">
              <span className="text-muted">Clinic Reception:</span>
              <a href={`tel:${doctor.clinic.phone}`} className="font-semibold text-primary hover:underline">
                {doctor.clinic.phone}
              </a>
            </div>
          </Card>
        </div>
      </main>
      </ViewerLocationProvider>
      <Footer />
    </>
  );
}
