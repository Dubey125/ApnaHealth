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
import { formatClinicDate, formatClinicTime, formatDurationMinutes } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SessionStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconClock } from "@/components/ui/icons";

interface QueuePageProps {
  params: Promise<{ sessionId: string }>;
}

function waitedFor(since: Date | null, now: Date): string | null {
  if (!since) return null;
  return formatDurationMinutes((now.getTime() - since.getTime()) / 1000);
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

  const [current, waiting, breaks, recentlyCompleted, completedCount, noShowCount] = await Promise.all([
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
    prisma.token.count({ where: { sessionId: clinicSession.id, status: "COMPLETED" } }),
    prisma.token.count({ where: { sessionId: clinicSession.id, status: "NO_SHOW" } }),
  ]);
  const now = new Date();

  const queueOpen = clinicSession.status === "OPEN" || clinicSession.status === "IN_PROGRESS";
  const activeBreak = breaks.find((b) => now >= b.startAt && now < b.endAt) ?? null;

  // The single most important distinction on this screen: "call next" only
  // ever picks the lowest-numbered CHECKED_IN token (see callNextToken), so
  // a booked patient who hasn't arrived is NOT callable. Showing both in
  // one list invites the front desk to expect a name to come up that
  // physically cannot.
  const readyToCall = waiting.filter((t) => t.status === "CHECKED_IN");
  const notArrived = waiting.filter((t) => t.status === "BOOKED");
  const nextUp = readyToCall[0] ?? null;

  const seen = completedCount + noShowCount;
  const totalIssued = seen + waiting.length + (current ? 1 : 0);
  const progressPct = totalIssued > 0 ? Math.round((seen / totalIssued) * 100) : 0;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PollingRefresher />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{clinicSession.doctor.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{clinicSession.doctor.specialty}</span>
            <span aria-hidden="true">·</span>
            <span>{clinicSession.locationLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {formatClinicTime(clinicSession.plannedStartAt)} – {formatClinicTime(clinicSession.plannedEndAt)}
            </span>
            <SessionStatusBadge status={clinicSession.status} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <TransitionButtons sessionId={clinicSession.id} status={clinicSession.status} returnTo="queue" />
          <p className="flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite">
            <IconClock className="h-3.5 w-3.5" />
            Updated {formatClinicTime(now)}
          </p>
        </div>
      </div>

      {/* Session progress: how far through the day this queue actually is. */}
      {totalIssued > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">
              <span className="tabular-nums">{seen}</span> of <span className="tabular-nums">{totalIssued}</span> seen
            </span>
            <span className="text-muted">
              <span className="tabular-nums">{readyToCall.length}</span> ready ·{" "}
              <span className="tabular-nums">{notArrived.length}</span> not arrived
              {noShowCount > 0 && (
                <>
                  {" "}
                  · <span className="tabular-nums">{noShowCount}</span> no-show
                </>
              )}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {activeBreak && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning">
          On a scheduled break until {formatClinicTime(activeBreak.endAt)} — {activeBreak.reason}
        </div>
      )}

      {/* Two columns at lg+ (1024px+): primary console controls on the
          left stay above the fold regardless of queue length because the
          waiting lists scroll within their own bounded panels rather than
          growing the page — PHASE-16's "reachable without scrolling at
          1280px+". Below lg, everything stacks and the page scrolls
          normally, which is fine for a tablet in portrait. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center gap-1 py-8 text-center">
            {current ? (
              <>
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Current patient</span>
                <div className="text-6xl font-bold tabular-nums leading-none text-foreground lg:text-7xl">
                  #{current.tokenNumber}
                </div>
                <div className="mt-2 text-lg font-medium text-foreground">{current.patientNameSnapshot}</div>
                <div className="text-sm text-muted">{current.patientPhoneSnapshot}</div>
                {current.consultStartedAt && (
                  <div className="mt-1 text-xs text-muted">
                    In consult {waitedFor(current.consultStartedAt, now)} · since{" "}
                    {formatClinicTime(current.consultStartedAt)}
                  </div>
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
              <EmptyState
                title="No patient currently in consult"
                description={nextUp ? `#${nextUp.tokenNumber} ${nextUp.patientNameSnapshot} is next.` : undefined}
              />
            )}
          </Card>

          {queueOpen && <DoneCallNextButton sessionId={clinicSession.id} />}

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Ready to call ({readyToCall.length})
            </h2>
            {readyToCall.length === 0 ? (
              <EmptyState
                title="Nobody checked in"
                description="Only checked-in patients can be called. Check in an arrival below."
              />
            ) : (
              <ul className="flex max-h-[24rem] flex-col gap-2 overflow-y-auto rounded-lg border border-border p-2">
                {readyToCall.map((token) => {
                  const isNext = nextUp?.id === token.id;
                  return (
                    <li key={token.id}>
                      <Card
                        className={
                          isNext
                            ? "flex flex-wrap items-center justify-between gap-3 border-primary/40 bg-primary/5"
                            : "flex flex-wrap items-center justify-between gap-3 bg-background"
                        }
                      >
                        <div className="flex min-w-0 items-center gap-3 text-sm">
                          <span className="text-xl font-bold tabular-nums text-foreground">#{token.tokenNumber}</span>
                          <span className="flex min-w-0 flex-col">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-medium text-foreground">{token.patientNameSnapshot}</span>
                              {isNext && <Badge variant="info">Next up</Badge>}
                            </span>
                            <span className="text-xs text-muted">
                              Waiting {waitedFor(token.checkedInAt, now) ?? "—"}
                              {token.source === "WALK_IN" ? " · walk-in" : ""}
                            </span>
                          </span>
                        </div>
                        <WaitingRowActions
                          sessionId={clinicSession.id}
                          tokenId={token.id}
                          tokenLabel={`#${token.tokenNumber} ${token.patientNameSnapshot}`}
                          showCheckIn={false}
                        />
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Booked — not arrived ({notArrived.length})
            </h2>
            {notArrived.length === 0 ? (
              <EmptyState title="Everyone booked has arrived" />
            ) : (
              <ul className="flex max-h-[20rem] flex-col gap-2 overflow-y-auto rounded-lg border border-border p-2">
                {notArrived.map((token) => (
                  <li key={token.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-3 bg-background">
                      <div className="flex min-w-0 items-center gap-3 text-sm">
                        <span className="text-xl font-bold tabular-nums text-muted">#{token.tokenNumber}</span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-foreground">{token.patientNameSnapshot}</span>
                          {/* Phone shown here specifically because this is
                              the list where the front desk may need to ring
                              a patient who hasn't turned up. */}
                          <span className="text-xs text-muted">
                            {token.patientPhoneSnapshot} · booked {formatClinicTime(token.issuedAt)}
                          </span>
                        </span>
                      </div>
                      <WaitingRowActions
                        sessionId={clinicSession.id}
                        tokenId={token.id}
                        tokenLabel={`#${token.tokenNumber} ${token.patientNameSnapshot}`}
                        showCheckIn
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Scheduled breaks</h2>
            {breaks.length > 0 && (
              <ul className="flex flex-col gap-2">
                {breaks.map((brk) => {
                  const active = now >= brk.startAt && now < brk.endAt;
                  const past = now >= brk.endAt;
                  return (
                    <li key={brk.id}>
                      <Card className={past ? "opacity-50" : ""}>
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
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
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recently completed</h2>
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
