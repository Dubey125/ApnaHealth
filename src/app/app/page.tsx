import Link from "next/link";
import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { clinicDayBounds } from "@/lib/clinicDay";
import { formatClinicTime } from "@/lib/format";
import { PollingRefresher } from "@/components/PollingRefresher";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SessionStatusBadge } from "@/components/ui/StatusBadge";

// Nav and sign-out live in the persistent header (AppShell, wired in via
// app/app/layout.tsx). Owner and Doctor land here as a light clinic-name
// landing since Owner's nav already reaches every clinic-wide page and
// Doctor has its own dashboard one click away — Front Desk, though, had no
// nav entry pointing anywhere but "Sessions" and no view of what's active
// right now without navigating there first, so this branch gives that role
// the same "today's active sessions, straight to the queue" landing
// /app/doctor already gives doctors, just clinic-wide instead of one
// doctor's own sessions.
export default async function AppHome() {
  const session = await requireStaffSession();
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: session.clinicId } });

  if (session.role !== "FRONT_DESK") {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-2 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{clinic.name}</h1>
        <p className="text-sm text-muted">
          Signed in as <strong className="font-medium text-foreground">{session.role.replace("_", " ")}</strong>
          {session.doctorId ? " · linked to a doctor profile" : ""}.
        </p>
      </main>
    );
  }

  const { start, end } = clinicDayBounds(new Date());
  const sessions = await prisma.session.findMany({
    where: { clinicId: session.clinicId, sessionDate: { gte: start, lt: end } },
    include: { doctor: { select: { name: true } } },
    orderBy: { plannedStartAt: "asc" },
  });
  const activeSessions = sessions.filter((s) => s.status === "OPEN" || s.status === "IN_PROGRESS");
  const now = new Date();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      {activeSessions.length > 0 && <PollingRefresher />}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{clinic.name}</h1>
        {activeSessions.length > 0 && (
          <p className="text-xs text-muted" role="status" aria-live="polite">
            Updated {formatClinicTime(now)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted">Active now</h2>
        {activeSessions.length === 0 ? (
          <EmptyState title="No active sessions right now" description="Sessions open for walk-ins or in progress today will appear here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {activeSessions.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">{s.doctor.name}</div>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <span>{s.locationLabel}</span>
                      <SessionStatusBadge status={s.status} />
                    </div>
                  </div>
                  <Link
                    href={`/app/queue/${s.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    Open queue
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sessions.length > activeSessions.length && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">Rest of today</h2>
          <ul className="flex flex-col gap-2">
            {sessions
              .filter((s) => s.status !== "OPEN" && s.status !== "IN_PROGRESS")
              .map((s) => (
                <li key={s.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="font-medium text-foreground">{s.doctor.name}</div>
                      <div className="flex items-center gap-2 text-muted">
                        <span>{s.locationLabel}</span>
                        <SessionStatusBadge status={s.status} />
                      </div>
                    </div>
                    <Link href={`/app/queue/${s.id}`} className="text-sm text-primary underline underline-offset-2">
                      View
                    </Link>
                  </Card>
                </li>
              ))}
          </ul>
        </div>
      )}

      <Link href="/app/sessions" className="text-sm text-primary underline underline-offset-2">
        View all sessions
      </Link>
    </main>
  );
}
