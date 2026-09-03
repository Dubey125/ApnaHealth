import { notFound } from "next/navigation";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { OPDDisplayMode } from "@/components/queue/OPDDisplayMode";
import { PollingRefresher } from "@/components/PollingRefresher";
import { QUEUE_ORDER_BY } from "@/lib/queue/ordering";

interface OPDDisplayPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function OPDDisplayPage({ params }: OPDDisplayPageProps) {
  const session = await requireStaffSession("OWNER", "FRONT_DESK", "DOCTOR");
  const { sessionId } = await params;

  const clinicSession = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { doctor: true, clinic: true },
  });
  if (!clinicSession) {
    notFound();
  }
  assertClinicAccess(session, clinicSession.clinicId);

  const [current, readyTokens, breaks] = await Promise.all([
    prisma.token.findFirst({
      where: { sessionId: clinicSession.id, status: "IN_CONSULT" },
    }),
    prisma.token.findMany({
      where: { sessionId: clinicSession.id, status: "CHECKED_IN" },
      orderBy: QUEUE_ORDER_BY,
      select: { id: true, tokenNumber: true, patientNameSnapshot: true },
    }),
    prisma.sessionBreak.findMany({
      where: { sessionId: clinicSession.id },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const now = new Date();
  const activeBreak = breaks.find((b) => now >= b.startAt && now < b.endAt) ?? null;

  return (
    <>
      <PollingRefresher intervalMs={3000} />
      <OPDDisplayMode
        doctorName={clinicSession.doctor.name}
        doctorSpecialty={clinicSession.doctor.specialty}
        locationLabel={clinicSession.locationLabel}
        clinicName={clinicSession.clinic.name}
        sessionStatus={clinicSession.status}
        currentNumber={current?.tokenNumber ?? null}
        currentPatientName={current?.patientNameSnapshot ?? null}
        consultStartedAt={current?.consultStartedAt ?? null}
        readyTokens={readyTokens}
        activeBreak={activeBreak ? { reason: activeBreak.reason, endAt: activeBreak.endAt } : null}
      />
    </>
  );
}
