import Link from "next/link";
import { requirePatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TokenStatusBadge } from "@/components/ui/StatusBadge";
import { formatClinicDate, formatClinicTime } from "@/lib/format";

// Every token a patient has ever held (booked, checked in, completed,
// no-show, cancelled) — the only way back to a ticket page today is the
// link shown right after booking, so a lost link left a patient with no
// way back in. Scoped to session.patientId only, same boundary as
// /patient/records; no clinical data here so no RecordAccessEvent logging
// (PRIVACY_BOUNDARY.md's access log is about consultation records, not
// queue/booking status, which /t/[publicId] already shows unauthenticated).
export default async function PatientBookingsPage() {
  const session = await requirePatientSession();

  const tokens = await prisma.token.findMany({
    where: { patientId: session.patientId },
    include: { session: { include: { doctor: true, clinic: true } } },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <PageHeader title="My bookings" backHref="/patient/account" backLabel="Account" />
        {tokens.length === 0 ? (
          <EmptyState title="No bookings yet" description="Tokens you book or check in with will appear here." />
        ) : (
          <ul className="flex flex-col gap-3">
            {tokens.map((token) => (
              <li key={token.id}>
                <Link href={`/t/${token.publicId}`}>
                  <Card className="flex flex-col gap-1 transition-colors hover:border-primary/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        #{token.tokenNumber} · {token.session.doctor.name}
                      </span>
                      <TokenStatusBadge status={token.status} />
                    </div>
                    <span className="text-sm text-muted">
                      {token.session.clinic.name} · {token.session.locationLabel}
                    </span>
                    <span className="text-sm text-muted">
                      {formatClinicDate(token.session.sessionDate)} · {formatClinicTime(token.session.plannedStartAt)} –{" "}
                      {formatClinicTime(token.session.plannedEndAt)}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
