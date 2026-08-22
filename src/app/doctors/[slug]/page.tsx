import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { formatClinicDate, formatClinicTime, formatFeeMinor } from "@/lib/format";

interface DoctorProfilePageProps {
  params: Promise<{ slug: string }>;
}

export default async function DoctorProfilePage({ params }: DoctorProfilePageProps) {
  const { slug } = await params;

  const doctor = await prisma.doctor.findFirst({
    where: { slug, isActive: true, clinic: { isActive: true } },
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
    orderBy: { sessionDate: "asc" },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{doctor.name}</h1>
            {doctor.verificationStatus === "VERIFIED" && (
              <VerificationStatusBadge status={doctor.verificationStatus} />
            )}
          </div>
          <p className="text-base text-foreground">{doctor.specialty}</p>
          <p className="text-sm text-muted">{doctor.qualificationText}</p>
          {doctor.experienceYears != null && (
            <p className="text-sm text-muted">{doctor.experienceYears} years experience</p>
          )}
          {doctor.languagesText && <p className="text-sm text-muted">Speaks: {doctor.languagesText}</p>}
          {doctor.consultationFeeMinor != null && (
            <p className="text-sm text-muted">Consultation fee: {formatFeeMinor(doctor.consultationFeeMinor)}</p>
          )}
          {doctor.bio && <p className="mt-2 text-sm text-foreground">{doctor.bio}</p>}
        </div>

        <Card>
          <h2 className="text-lg font-medium">{doctor.clinic.name}</h2>
          <p className="text-sm text-muted">
            {doctor.clinic.addressLine}, {doctor.clinic.city}, {doctor.clinic.state}
            {doctor.clinic.postalCode ? ` ${doctor.clinic.postalCode}` : ""}
          </p>
          <p className="text-sm text-muted">{doctor.clinic.phone}</p>
        </Card>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Upcoming sessions</h2>
          {upcomingSessions.length === 0 ? (
            <EmptyState
              title="No upcoming sessions scheduled"
              description="Check back later, or search for another doctor."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {upcomingSessions.map((session) => (
                <li key={session.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{formatClinicDate(session.sessionDate)}</div>
                      <div className="text-sm text-muted">
                        {formatClinicTime(session.plannedStartAt)} – {formatClinicTime(session.plannedEndAt)} ·{" "}
                        {session.locationLabel}
                      </div>
                    </div>
                    {session.status === "OPEN" || session.status === "IN_PROGRESS" ? (
                      <Link
                        href={`/book/${session.publicId}`}
                        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        Book
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">Not open yet</span>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
