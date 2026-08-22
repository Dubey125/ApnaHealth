import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { WalkInForm } from "./WalkInForm";
import { DoneCallNextButton } from "./DoneCallNextButton";
import { WaitingRowActions } from "./WaitingRowActions";
import { PollingRefresher } from "@/components/PollingRefresher";
import { BreakForm } from "./BreakForm";
import { TransitionButtons } from "@/app/app/sessions/TransitionButtons";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SessionStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

interface QueuePageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function QueuePage({ params }: QueuePageProps) {
  const session = await requireStaffSession("OWNER", "FRONT_DESK", "DOCTOR");
  const { sessionId } = await params;

  const clinicSession = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { doctor: true },
  });
  if (!clinicSession) {
    notFound();
  }
  assertClinicAccess(session, clinicSession.clinicId);
  if (session.role === "DOCTOR" && session.doctorId !== clinicSession.doctorId) {
    throw new Error("You can only manage your own sessions.");
  }

  const [current, waiting, breaks, recentlyCompleted] = await Promise.all([
    prisma.token.findFirst({ where: { sessionId: clinicSession.id, status: "IN_CONSULT" } }),
    prisma.token.findMany({
      where: { sessionId: clinicSession.id, status: { in: ["BOOKED", "CHECKED_IN"] } },
      orderBy: { tokenNumber: "asc" },
    }),
    prisma.sessionBreak.findMany({ where: { sessionId: clinicSession.id }, orderBy: { startAt: "asc" } }),
    // Consultation-record authoring is doctor-only (ACCESS_MATRIX.md), so
    // this list is only fetched/shown for the DOCTOR role.
    session.role === "DOCTOR"
      ? prisma.token.findMany({
          where: { sessionId: clinicSession.id, status: "COMPLETED" },
          orderBy: { consultEndedAt: "desc" },
          take: 10,
          include: { consultationRecords: { select: { id: true } } },
        })
      : Promise.resolve([]),
  ]);
  const now = new Date();

  const queueOpen = clinicSession.status === "OPEN" || clinicSession.status === "IN_PROGRESS";
  const activeBreak = breaks.find((b) => now >= b.startAt && now < b.endAt) ?? null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PollingRefresher />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{clinicSession.doctor.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>{clinicSession.locationLabel}</span>
            <SessionStatusBadge status={clinicSession.status} />
          </div>
        </div>
        <TransitionButtons sessionId={clinicSession.id} status={clinicSession.status} returnTo="queue" />
      </div>

      {activeBreak && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning">
          On a scheduled break until {formatClinicTime(activeBreak.endAt)} — {activeBreak.reason}
        </div>
      )}

      {/* Two columns at lg+ (1024px+): primary console controls on the
          left stay above the fold regardless of queue length because the
          waiting list scrolls within its own bounded panel rather than
          growing the page — PHASE-16's "reachable without scrolling at
          1280px+". Below lg, everything stacks and the page scrolls
          normally, which is fine for a tablet in portrait. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center gap-1 py-8 text-center">
            {current ? (
              <>
                <span className="text-xs font-medium text-muted">Current patient</span>
                <div className="text-6xl font-bold tabular-nums leading-none text-foreground lg:text-7xl">
                  #{current.tokenNumber}
                </div>
                <div className="mt-2 text-lg font-medium text-foreground">{current.patientNameSnapshot}</div>
                <div className="text-sm text-muted">{current.patientPhoneSnapshot}</div>
                {current.consultStartedAt && (
                  <div className="mt-1 text-xs text-muted">In consult since {formatClinicTime(current.consultStartedAt)}</div>
                )}
                {session.role === "DOCTOR" && (
                  <Link
                    href={`/app/queue/${clinicSession.id}/token/${current.id}/record`}
                    className="mt-2 text-sm text-primary underline underline-offset-2"
                  >
                    Consultation record
                  </Link>
                )}
              </>
            ) : (
              <EmptyState title="No patient currently in consult" />
            )}
          </Card>

          {queueOpen && <DoneCallNextButton sessionId={clinicSession.id} />}

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted">Waiting ({waiting.length})</h2>
            {waiting.length === 0 ? (
              <EmptyState title="No one waiting" />
            ) : (
              <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto rounded-lg border border-border p-2">
                {waiting.map((token) => (
                  <li key={token.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-3 bg-background">
                      <div className="text-sm">
                        <span className="font-medium text-foreground">#{token.tokenNumber}</span>{" "}
                        <span className="text-foreground">{token.patientNameSnapshot}</span>{" "}
                        <span className="text-muted">({token.source === "WALK_IN" ? "walk-in" : "self-booked"})</span>
                        <div className="text-muted">{token.status.replace("_", " ")}</div>
                      </div>
                      <WaitingRowActions
                        sessionId={clinicSession.id}
                        tokenId={token.id}
                        tokenLabel={`#${token.tokenNumber} ${token.patientNameSnapshot}`}
                        showCheckIn={token.status === "BOOKED"}
                      />
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {queueOpen && <WalkInForm sessionId={clinicSession.id} />}

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted">Scheduled breaks</h2>
            {breaks.length > 0 && (
              <ul className="flex flex-col gap-2">
                {breaks.map((brk) => {
                  const active = now >= brk.startAt && now < brk.endAt;
                  const past = now >= brk.endAt;
                  return (
                    <li key={brk.id}>
                      <Card className={past ? "opacity-50" : ""}>
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {formatClinicDate(brk.startAt)} · {formatClinicTime(brk.startAt)} – {formatClinicTime(brk.endAt)}
                          {active && <Badge variant="warning">On break now</Badge>}
                        </div>
                        <div className="text-sm text-muted">{brk.reason}</div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
            <BreakForm sessionId={clinicSession.id} />
          </div>

          {session.role === "DOCTOR" && recentlyCompleted.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted">Recently completed</h2>
              <ul className="flex flex-col gap-2">
                {recentlyCompleted.map((token) => (
                  <li key={token.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div>
                        <span className="font-medium text-foreground">#{token.tokenNumber}</span>{" "}
                        <span className="text-foreground">{token.patientNameSnapshot}</span>
                      </div>
                      <Link
                        href={`/app/queue/${clinicSession.id}/token/${token.id}/record`}
                        className="text-sm text-primary underline underline-offset-2"
                      >
                        {token.consultationRecords.length > 0 ? "View record" : "Add record"}
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
