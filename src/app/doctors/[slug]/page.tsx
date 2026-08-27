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

interface DoctorProfilePageProps {
  params: Promise<{ slug: string }>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default async function DoctorProfilePage({ params }: DoctorProfilePageProps) {
  const { slug } = await params;

  const doctor = await prisma.doctor.findFirst({
    where: { slug, ...LISTED_DOCTOR },
    include: { clinic: true },
  });

  if (!doctor) {
    notFound();
  }

  // Filtered on plannedEndAt rather than sessionDate: sessionDate is a
  // date-only marker, and comparing it against a UTC "start of today"
  // wrongly excludes a same-day IST session whose date-only timestamp
  // lands before UTC midnight. plannedEndAt says precisely whether the
  // session's window is still ahead of us.
  const upcomingSessions = await prisma.session.findMany({
    where: {
      doctorId: doctor.id,
      status: { in: ["SCHEDULED", "OPEN", "IN_PROGRESS"] },
      plannedEndAt: { gte: new Date() },
    },
    orderBy: { plannedStartAt: "asc" },
  });

  // Live waiting count per bookable session, so a patient can see how busy
  // the queue is *before* booking — counts only, never another patient's
  // name or phone (QUEUE_RULES.md).
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

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <Link href="/doctors" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
          ← Back to search
        </Link>

        <Card className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar name={doctor.name} photoUrl={doctor.photoUrl} size={88} className="shrink-0" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{doctor.name}</h1>
                {doctor.verificationStatus === "VERIFIED" && (
                  <VerificationStatusBadge status={doctor.verificationStatus} />
                )}
              </div>
              <p className="text-base font-medium text-primary">{doctor.specialty}</p>
              <p className="text-sm text-muted">{doctor.qualificationText}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            {doctor.experienceYears != null && <Fact label="Experience" value={`${doctor.experienceYears} years`} />}
            {doctor.consultationFeeMinor != null && (
              <Fact label="Consultation" value={formatFeeMinor(doctor.consultationFeeMinor)} />
            )}
            {doctor.languagesText && <Fact label="Speaks" value={doctor.languagesText} />}
            <Fact label="Typical visit" value={`~${doctor.defaultConsultMinutes} min`} />
          </dl>

          {doctor.bio && <p className="border-t border-border pt-4 text-sm text-foreground">{doctor.bio}</p>}
        </Card>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Availability &amp; booking</h2>
          {upcomingSessions.length === 0 ? (
            <EmptyState
              title="No upcoming sessions scheduled"
              description="Check back later, or search for another doctor."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {upcomingSessions.map((session) => {
                const bookable = session.status === "OPEN" || session.status === "IN_PROGRESS";
                const waiting = waitingBySession.get(session.id) ?? 0;
                return (
                  <li key={session.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-foreground">
                            {formatClinicDateWithWeekday(session.sessionDate)}
                          </span>
                          {session.status === "IN_PROGRESS" && <Badge variant="warning">Running now</Badge>}
                          {session.status === "OPEN" && <Badge variant="success">Open for booking</Badge>}
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {formatClinicTime(session.plannedStartAt)} – {formatClinicTime(session.plannedEndAt)}
                        </span>
                        <span className="text-sm text-muted">
                          {doctor.clinic.name} · {session.locationLabel}
                          {doctor.clinic.areaLabel ? ` · ${doctor.clinic.areaLabel}` : ""}, {doctor.clinic.city}
                        </span>
                        {bookable && (
                          <span className="text-sm text-muted">
                            {waiting === 0 ? "No one waiting yet" : `${waiting} in the queue right now`}
                          </span>
                        )}
                      </div>
                      {bookable ? (
                        <Link
                          href={`/book/${session.publicId}`}
                          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                          Book token
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">Opens closer to the day</span>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {(doctor.phone || doctor.email) && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Contact</h2>
            <Card className="flex flex-col gap-1 text-sm">
              {doctor.phone && (
                <a href={`tel:${doctor.phone}`} className="text-primary underline underline-offset-2">
                  {doctor.phone}
                </a>
              )}
              {doctor.email && (
                <a href={`mailto:${doctor.email}`} className="text-primary underline underline-offset-2">
                  {doctor.email}
                </a>
              )}
              <span className="text-xs text-muted">
                For appointments, booking a token below is faster than calling.
              </span>
            </Card>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {doctor.clinic.facilityType === "HOSPITAL" ? "Hospital" : "Clinic"}
          </h2>
          <Card className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{doctor.clinic.name}</span>
              {doctor.clinic.facilityType === "HOSPITAL" && <Badge variant="info">Hospital</Badge>}
            </div>
            <span className="text-sm text-muted">
              {doctor.clinic.addressLine}
              {doctor.clinic.areaLabel ? `, ${doctor.clinic.areaLabel}` : ""}, {doctor.clinic.city},{" "}
              {doctor.clinic.state}
              {doctor.clinic.postalCode ? ` ${doctor.clinic.postalCode}` : ""}
            </span>
            <a href={`tel:${doctor.clinic.phone}`} className="text-sm text-primary underline underline-offset-2">
              {doctor.clinic.phone}
            </a>
          </Card>
        </div>
      </main>
      <Footer />
    </>
  );
}
