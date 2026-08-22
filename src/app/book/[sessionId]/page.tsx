import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BookingForm } from "./BookingForm";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { formatClinicDate, formatClinicTime } from "@/lib/format";

interface BookPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function BookPage({ params }: BookPageProps) {
  const { sessionId: sessionPublicId } = await params;

  const session = await prisma.session.findFirst({
    where: { publicId: sessionPublicId },
    include: { doctor: true, clinic: true },
  });
  if (!session) {
    notFound();
  }

  const tokenCount = await prisma.token.count({
    where: { sessionId: session.id, status: { not: "CANCELLED" } },
  });
  const bookable = session.status === "OPEN" || session.status === "IN_PROGRESS";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <Card className="flex flex-col gap-1">
          <h1 className="text-lg font-medium">{session.doctor.name}</h1>
          <p className="text-sm text-muted">
            {session.clinic.name} · {session.locationLabel}
          </p>
          <p className="text-sm text-muted">
            {formatClinicDate(session.sessionDate)} · {formatClinicTime(session.plannedStartAt)} –{" "}
            {formatClinicTime(session.plannedEndAt)}
          </p>
          <p className="text-sm text-muted">
            {tokenCount} token{tokenCount === 1 ? "" : "s"} issued so far
          </p>
        </Card>

        {bookable ? (
          <BookingForm sessionId={session.id} />
        ) : (
          <Alert variant="danger">This session is not currently accepting bookings.</Alert>
        )}
      </main>
    </>
  );
}
