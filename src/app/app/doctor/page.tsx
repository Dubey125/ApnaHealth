import Link from "next/link";
import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { clinicDayBounds } from "@/lib/clinicDay";
import { formatClinicTime, formatDurationMinutes, formatPercent } from "@/lib/format";
import { DoneCallNextButton } from "@/app/app/queue/[sessionId]/DoneCallNextButton";
import { PollingRefresher } from "@/components/PollingRefresher";
import { buildClinicReport } from "@/lib/analytics/report";
import { parseReportRange } from "@/lib/analytics/range";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SessionStatusBadge } from "@/components/ui/StatusBadge";

// The doctor's entry point (PHASE-09.md): today's sessions, the current
// queue/patient for whichever session is active right now, a way into the
// authorized-history + consultation form (Phase 8's record page), and the
// same complete-consultation control used on the full queue screen — all
// without duplicating that screen's front-desk-facing features (walk-ins,
// breaks, waiting-list actions), which stay on /app/queue/[sessionId].
export default async function DoctorDashboardPage() {
  const session = await requireStaffSession("DOCTOR");
  if (!session.doctorId) {
    throw new Error("This staff account is not linked to a doctor profile.");
  }

  const { start, end } = clinicDayBounds(new Date());
  const sessions = await prisma.session.findMany({
    where: { doctorId: session.doctorId, sessionDate: { gte: start, lt: end } },
    orderBy: { plannedStartAt: "asc" },
  });

  const activeSessions = sessions.filter((s) => s.status === "OPEN" || s.status === "IN_PROGRESS");
  const currentTokens =
    activeSessions.length > 0
      ? await prisma.token.findMany({
          where: { sessionId: { in: activeSessions.map((s) => s.id) }, status: "IN_CONSULT" },
        })
      : [];

  // "Limited" analytics (ACCESS_MATRIX.md: Doctor's "View analytics" is
  // limited, unlike Owner's full clinic-wide /app/analytics) — scoped to
  // this doctor only, fixed to the last 30 days, no CSV export.
  const report = await buildClinicReport(session.clinicId, parseReportRange(null, null), session.doctorId);
  const now = new Date();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-4 sm:p-6">
      {/* This page showed live "current patient" data with no way to see
          it change short of a manual reload — the front-desk console
          (same underlying data) already polls; this didn't. Real gap,
          fixed here rather than left inconsistent. */}
      {activeSessions.length > 0 && <PollingRefresher />}
      <PageHeader
        title="Today's sessions"
        action={
          activeSessions.length > 0 ? (
            <p className="text-xs text-muted" role="status" aria-live="polite">
              Updated {formatClinicTime(now)}
            </p>
          ) : undefined
        }
      />

      {activeSessions.length === 0 ? (
        <EmptyState title="No active session right now" description="Sessions you're running today will appear here once they open." />
      ) : (
        <div className="flex flex-col gap-4">
          {activeSessions.map((activeSession) => {
            const current = currentTokens.find((t) => t.sessionId === activeSession.id) ?? null;
            return (
              <Card key={activeSession.id} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">{activeSession.locationLabel}</h2>
                    <SessionStatusBadge status={activeSession.status} />
                  </div>
                  <Link href={`/app/queue/${activeSession.id}`} className="text-sm text-primary underline underline-offset-2">
                    Open full queue
                  </Link>
                </div>

                {current ? (
                  <div className="flex flex-col items-center gap-1 rounded-md bg-background py-6 text-center">
                    <span className="text-xs font-medium text-muted">Current patient</span>
                    <div className="text-4xl font-bold tabular-nums leading-none text-foreground sm:text-6xl">
                      #{current.tokenNumber}
                    </div>
                    <div className="mt-1 text-base font-medium text-foreground">{current.patientNameSnapshot}</div>
                    {current.consultStartedAt && (
                      <div className="text-xs text-muted">In consult since {formatClinicTime(current.consultStartedAt)}</div>
                    )}
                    <Link
                      href={`/app/queue/${activeSession.id}/token/${current.id}/record`}
                      className="mt-2 text-sm text-primary underline underline-offset-2"
                    >
                      Consultation record
                    </Link>
                  </div>
                ) : (
                  <EmptyState title="No patient currently in consult" />
                )}

                <DoneCallNextButton sessionId={activeSession.id} />
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">All sessions today</h2>
        {sessions.length === 0 ? (
          <EmptyState title="No sessions scheduled for today" />
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted">
                      {formatClinicTime(s.plannedStartAt)} – {formatClinicTime(s.plannedEndAt)} · {s.locationLabel}
                    </div>
                    <SessionStatusBadge status={s.status} />
                  </div>
                  <Link href={`/app/queue/${s.id}`} className="text-sm text-primary underline underline-offset-2">
                    Open queue
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Your last 30 days</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <div className="text-xs text-muted">Median wait</div>
            <div className="text-lg font-semibold tabular-nums">{formatDurationMinutes(report.waitTime.medianSeconds)}</div>
          </Card>
          <Card>
            <div className="text-xs text-muted">Median consultation</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatDurationMinutes(report.consultDuration.medianSeconds)}
            </div>
          </Card>
          <Card>
            <div className="text-xs text-muted">No-show rate</div>
            <div className="text-lg font-semibold tabular-nums">{formatPercent(report.noShowRate)}</div>
          </Card>
          <Card>
            <div className="text-xs text-muted">Prediction window hit rate</div>
            <div className="text-lg font-semibold tabular-nums">{formatPercent(report.prediction.windowHitRate)}</div>
          </Card>
        </div>
      </div>
    </main>
  );
}
