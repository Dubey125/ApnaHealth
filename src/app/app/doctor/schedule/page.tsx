import Link from "next/link";
import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { clinicDayBounds } from "@/lib/clinicDay";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SessionStatusBadge } from "@/components/ui/StatusBadge";
import { SessionForm } from "@/app/app/sessions/SessionForm";
import { TransitionButtons } from "@/app/app/sessions/TransitionButtons";

// A doctor's own schedule: everything from today onward (/app/doctor only
// ever showed *today's* sessions), plus the ability to schedule their own
// sessions and open/pause/close them — ACCESS_MATRIX.md's "Create session"
// row now grants Doctor ✅ for their own sessions, enforced in createSession
// by taking doctorId from the session cookie rather than the form.
export default async function DoctorSchedulePage() {
  const session = await requireStaffSession("DOCTOR");
  if (!session.doctorId) {
    throw new Error("This staff account is not linked to a doctor profile.");
  }

  const { start } = clinicDayBounds(new Date());
  const sessions = await prisma.session.findMany({
    where: { doctorId: session.doctorId, sessionDate: { gte: start } },
    orderBy: { sessionDate: "asc" },
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="My schedule" backHref="/app/doctor" backLabel="Today's sessions" />

      <SessionForm title="Schedule a session" />

      {sessions.length === 0 ? (
        <EmptyState title="No upcoming sessions scheduled" description="Sessions your clinic schedules for you will appear here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium text-foreground">{formatClinicDate(s.sessionDate)}</div>
                  <div className="text-muted">
                    {formatClinicTime(s.plannedStartAt)} – {formatClinicTime(s.plannedEndAt)} · {s.locationLabel}
                  </div>
                  <div className="mt-1">
                    <SessionStatusBadge status={s.status} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <TransitionButtons sessionId={s.id} status={s.status} returnTo="queue" />
                  <Link href={`/app/queue/${s.id}`} className="text-sm text-primary underline underline-offset-2">
                    Open queue
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
