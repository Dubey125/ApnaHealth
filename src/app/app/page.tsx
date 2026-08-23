import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { clinicDayBounds } from "@/lib/clinicDay";
import { formatClinicTime, formatDurationMinutes, formatPercent } from "@/lib/format";
import { buildClinicReport } from "@/lib/analytics/report";
import { parseReportRange } from "@/lib/analytics/range";
import { PollingRefresher } from "@/components/PollingRefresher";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { SessionStatusBadge } from "@/components/ui/StatusBadge";
import { IconClock } from "@/components/ui/icons";

// The workspace landing for OWNER and FRONT_DESK: what is happening in the
// clinic right now, above anything historical. Doctors have their own
// richer /app/doctor dashboard and are routed there instead of duplicating
// it here.
//
// Every figure is derived from real rows — the live counts from today's
// tokens, the trailing figures from the same buildClinicReport() that
// powers /app/analytics — so this page can never drift from the analytics
// screen by computing its own parallel version of a metric.
export default async function AppHome() {
  const session = await requireStaffSession();

  // A doctor's landing is their own dashboard, not the clinic-wide one —
  // their sidebar has no /app entry, and this page is scoped to the whole
  // clinic's operations rather than their own sessions. /app has no
  // loading.tsx, so this redirect is a real HTTP 3xx (see proxy.ts's note
  // on redirects swallowed by a streaming Suspense boundary).
  if (session.role === "DOCTOR") {
    redirect("/app/doctor");
  }

  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: session.clinicId } });
  const isOwner = session.role === "OWNER";

  const { start, end } = clinicDayBounds(new Date());

  const [sessionsToday, waitingCount, inConsultCount, completedToday, report] = await Promise.all([
    prisma.session.findMany({
      where: { clinicId: session.clinicId, sessionDate: { gte: start, lt: end } },
      include: { doctor: { select: { name: true, specialty: true } } },
      orderBy: { plannedStartAt: "asc" },
    }),
    prisma.token.count({
      where: { session: { clinicId: session.clinicId, sessionDate: { gte: start, lt: end } }, status: { in: ["BOOKED", "CHECKED_IN"] } },
    }),
    prisma.token.count({
      where: { session: { clinicId: session.clinicId, sessionDate: { gte: start, lt: end } }, status: "IN_CONSULT" },
    }),
    prisma.token.count({
      where: { session: { clinicId: session.clinicId, sessionDate: { gte: start, lt: end } }, status: "COMPLETED" },
    }),
    // Owner-only: ACCESS_MATRIX.md grants Front Desk only "limited"
    // analytics, so the trailing clinic-wide figures are not fetched at
    // all for that role rather than merely hidden in the markup.
    isOwner ? buildClinicReport(session.clinicId, parseReportRange(null, null)) : Promise.resolve(null),
  ]);

  const activeSessions = sessionsToday.filter((s) => s.status === "OPEN" || s.status === "IN_PROGRESS");
  const now = new Date();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-4 sm:p-6">
      {activeSessions.length > 0 && <PollingRefresher />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{clinic.name}</h1>
          <p className="text-sm text-muted">
            {activeSessions.length > 0
              ? `${activeSessions.length} session${activeSessions.length === 1 ? "" : "s"} running right now`
              : "No sessions running right now"}
          </p>
        </div>
        {activeSessions.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite">
            <IconClock className="h-3.5 w-3.5" />
            Updated {formatClinicTime(now)}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Today</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Waiting" value={String(waitingCount)} tone={waitingCount > 0 ? "primary" : "default"} sub="booked or checked in" />
          <StatTile label="In consult" value={String(inConsultCount)} tone={inConsultCount > 0 ? "warning" : "default"} sub="right now" />
          <StatTile label="Completed" value={String(completedToday)} tone="success" sub="consultations today" />
          <StatTile label="Sessions" value={String(sessionsToday.length)} sub="scheduled today" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Live sessions</h2>
          <Link href="/app/sessions" className="text-sm text-primary underline underline-offset-2">
            All sessions
          </Link>
        </div>
        {activeSessions.length === 0 ? (
          <EmptyState
            title="Nothing running right now"
            description="Open a scheduled session to start issuing and calling tokens."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {activeSessions.map((s) => (
              <li key={s.id}>
                <Link href={`/app/queue/${s.id}`} className="block">
                  <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-primary/40">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{s.doctor.name}</span>
                        <SessionStatusBadge status={s.status} />
                      </div>
                      <span className="text-sm text-muted">
                        {s.doctor.specialty} · {s.locationLabel} · {formatClinicTime(s.plannedStartAt)} –{" "}
                        {formatClinicTime(s.plannedEndAt)}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-primary">Open queue →</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {report && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Last 30 days</h2>
            <Link href="/app/analytics" className="text-sm text-primary underline underline-offset-2">
              Full analytics
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Median wait" value={formatDurationMinutes(report.waitTime.medianSeconds)} sub={`n=${report.waitTime.sampleSize}`} />
            <StatTile
              label="Median consult"
              value={formatDurationMinutes(report.consultDuration.medianSeconds)}
              sub={`n=${report.consultDuration.sampleSize}`}
            />
            <StatTile label="No-show rate" value={formatPercent(report.noShowRate)} sub={`${report.sampleSize} tokens`} />
            <StatTile
              label="Prediction hit rate"
              value={formatPercent(report.prediction.windowHitRate)}
              sub={`n=${report.prediction.sampleSize}`}
              tone="primary"
            />
          </div>
          <p className="text-xs text-muted">
            Prediction hit rate is how often a patient&apos;s consultation actually began inside the arrival window they
            were shown — the measure that matters most for trusting the queue.
          </p>
        </section>
      )}

      {sessionsToday.length > activeSessions.length && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Rest of today</h2>
          <ul className="flex flex-col gap-2">
            {sessionsToday
              .filter((s) => s.status !== "OPEN" && s.status !== "IN_PROGRESS")
              .map((s) => (
                <li key={s.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{s.doctor.name}</span>
                      <span className="text-muted">
                        {s.locationLabel} · {formatClinicTime(s.plannedStartAt)} – {formatClinicTime(s.plannedEndAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <SessionStatusBadge status={s.status} />
                      <Link href={`/app/queue/${s.id}`} className="text-primary underline underline-offset-2">
                        View
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
          </ul>
        </section>
      )}

      {!isOwner && (
        <p className="text-xs text-muted">
          <Badge variant="neutral">Front desk</Badge> Clinic-wide analytics and audit history are available to the
          clinic owner.
        </p>
      )}
    </main>
  );
}
