import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_VARIANT } from "@/lib/appointmentStatus";

// "Live Queue" as a stand-alone nav destination has no single token to
// point at, unlike /t/[publicId] — this resolves to whichever appointment
// is actually active right now. One active token is the common case (go
// straight to it); zero is common too (nothing to show); more than one is
// rare (two different clinics at once) but not impossible, so it's listed
// rather than picked arbitrarily.
export default async function PatientQueuePage() {
  const session = await requirePatientSession();

  const activeTokens = await prisma.token.findMany({
    where: { patientId: session.patientId, status: { in: ["CHECKED_IN", "IN_CONSULT"] } },
    include: { session: { include: { doctor: true, clinic: true } } },
    orderBy: { checkedInAt: "asc" },
  });

  if (activeTokens.length === 1) {
    redirect(`/t/${activeTokens[0].publicId}`);
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <PageHeader title="Live queue" backHref="/patient/appointments" backLabel="Appointments" />
        {activeTokens.length === 0 ? (
          <EmptyState
            title="No active queue right now"
            description="Once you're checked in for an appointment, it will show up here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {activeTokens.map((token) => (
              <li key={token.id}>
                <Link href={`/t/${token.publicId}`}>
                  <Card className="flex flex-col gap-1 transition-colors hover:border-primary/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        #{token.tokenNumber} · {token.session.doctor.name}
                      </span>
                      <Badge variant={APPOINTMENT_STATUS_VARIANT[token.status]}>
                        {APPOINTMENT_STATUS_LABEL[token.status]}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted">
                      {token.session.clinic.name} · {token.session.locationLabel}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/patient/appointments" className="text-sm text-primary underline underline-offset-2">
          View all appointments
        </Link>
      </main>
    </>
  );
}
