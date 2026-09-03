import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { BookingForm } from "./BookingForm";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { Avatar } from "@/components/ui/Avatar";
import { formatClinicDateWithWeekday, formatClinicTime, formatFeeMinor } from "@/lib/format";
import { LISTED_SESSION } from "@/lib/publicListing";
import { getPatientSession } from "@/lib/auth/patient";

interface BookPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function BookPage({ params }: BookPageProps) {
  const { sessionId: sessionPublicId } = await params;

  const session = await prisma.session.findFirst({
    where: { publicId: sessionPublicId, ...LISTED_SESSION },
    include: { doctor: true, clinic: true },
  });
  if (!session) {
    notFound();
  }

  const [tokenCount, activePatient] = await Promise.all([
    prisma.token.count({
      where: { sessionId: session.id, status: { not: "CANCELLED" } },
    }),
    (async () => {
      const patientSession = await getPatientSession();
      if (!patientSession) return null;
      return prisma.patient.findUnique({ where: { id: patientSession.patientId } });
    })(),
  ]);

  const bookable = session.status === "OPEN" || session.status === "IN_PROGRESS";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
        <Link
          href={`/doctors/${session.doctor.slug}`}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted hover:text-primary transition-colors"
        >
          &larr; Back to {session.doctor.name}&apos;s profile
        </Link>

        {/* Doctor & Session Header Card */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-4">
            <Avatar name={session.doctor.name} photoUrl={session.doctor.photoUrl} size={64} className="shrink-0 ring-2 ring-primary/10" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">{session.doctor.name}</h1>
                {session.doctor.verificationStatus === "VERIFIED" && (
                  <VerificationStatusBadge status={session.doctor.verificationStatus} />
                )}
              </div>
              <p className="text-xs font-semibold text-primary">{session.doctor.specialty}</p>
              <p className="text-xs text-muted">
                {session.clinic.name} · {session.locationLabel}
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted block">Session Timing</span>
              <span className="font-semibold text-foreground">
                {formatClinicDateWithWeekday(session.sessionDate)} · {formatClinicTime(session.plannedStartAt)}
              </span>
            </div>
            <div>
              <span className="text-muted block">Consultation Fee</span>
              <span className="font-semibold text-foreground">
                {session.doctor.consultationFeeMinor != null
                  ? formatFeeMinor(session.doctor.consultationFeeMinor)
                  : "Standard OPD"}
              </span>
            </div>
            <div className="col-span-2 mt-1 rounded bg-surface p-2 text-muted">
              📊 <span className="font-medium text-foreground">{tokenCount}</span> digital token
              {tokenCount === 1 ? "" : "s"} already issued for this session.
            </div>
          </div>
        </Card>

        {bookable ? (
          <BookingForm
            sessionId={session.id}
            defaultName={activePatient?.name || ""}
            defaultPhone={activePatient?.phone || ""}
          />
        ) : (
          <Alert variant="danger">This session is not currently accepting public bookings.</Alert>
        )}
      </main>
      <Footer />
    </>
  );
}
