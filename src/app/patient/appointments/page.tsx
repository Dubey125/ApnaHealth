import Link from "next/link";
import { requirePatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_VARIANT,
  appointmentCtaLabel,
  isUpcomingAppointmentStatus,
} from "@/lib/appointmentStatus";
import type { TokenStatus } from "@/generated/prisma/enums";

// Every appointment a patient has ever held — "appointment" here is a
// self-booked Token (source: SELF_BOOK) joined through its Session for
// doctor/specialty/clinic/time, per the "Appointment model" design note:
// there is no separate Appointment entity. Scoped to session.patientId
// only, same boundary as /patient/records; no clinical data here so no
// RecordAccessEvent logging (PRIVACY_BOUNDARY.md's access log is about
// consultation records, not queue/booking status, which /t/[publicId]
// already shows unauthenticated).
export default async function PatientAppointmentsPage() {
  const session = await requirePatientSession();

  const tokens = await prisma.token.findMany({
    where: { patientId: session.patientId, source: "SELF_BOOK" },
    include: { session: { include: { doctor: true, clinic: true } } },
    orderBy: { issuedAt: "desc" },
  });

  const upcoming = tokens
    .filter((t) => isUpcomingAppointmentStatus(t.status))
    .sort((a, b) => a.session.plannedStartAt.getTime() - b.session.plannedStartAt.getTime());
  const past = tokens.filter((t) => !isUpcomingAppointmentStatus(t.status));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6">
        <PageHeader title="My appointments" backHref="/patient/account" backLabel="Account" />

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">Upcoming</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming appointments" description="Book a token with a doctor to see it here." />
          ) : (
            <AppointmentList tokens={upcoming} />
          )}
        </div>

        {past.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">Past</h2>
            <AppointmentList tokens={past} />
          </div>
        )}
      </main>
    </>
  );
}

interface AppointmentToken {
  id: string;
  publicId: string;
  tokenNumber: number;
  status: TokenStatus;
  session: {
    doctor: { name: string; specialty: string };
    clinic: { name: string; city: string };
    sessionDate: Date;
    plannedStartAt: Date;
    plannedEndAt: Date;
    locationLabel: string;
  };
}

function AppointmentList({ tokens }: { tokens: AppointmentToken[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {tokens.map((token) => (
        <li key={token.id}>
          <Link href={`/t/${token.publicId}`}>
            <Card className="flex flex-col gap-1 transition-colors hover:border-primary/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{token.session.doctor.name}</span>
                <Badge variant={APPOINTMENT_STATUS_VARIANT[token.status]}>{APPOINTMENT_STATUS_LABEL[token.status]}</Badge>
              </div>
              <span className="text-sm text-muted">{token.session.doctor.specialty}</span>
              <span className="text-sm text-muted">
                {token.session.clinic.name} · {token.session.clinic.city}
              </span>
              <span className="text-sm text-muted">
                {formatClinicDate(token.session.sessionDate)} · {formatClinicTime(token.session.plannedStartAt)} –{" "}
                {formatClinicTime(token.session.plannedEndAt)}
              </span>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-muted">Token #{token.tokenNumber}</span>
                <span className="font-medium text-primary">{appointmentCtaLabel(token.status)}</span>
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
