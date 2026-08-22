import Link from "next/link";
import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { SessionForm } from "./SessionForm";
import { TransitionButtons } from "./TransitionButtons";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { SessionStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";

// Widened from OWNER-only to also allow FRONT_DESK: ACCESS_MATRIX.md
// already grants front desk "Manage queue" on their own clinic's
// sessions (enforced per-session by loadSessionForStaff), but there was
// no way for them to discover which sessions exist to manage — /app had
// no nav link here either (see the PHASE-9/PHASE-12 audit notes). This is
// a deliberate, minimal authorization change, not a styling change: it
// grants read access to the session list plus the same transition
// controls already available to them per-session; "Create session" stays
// owner-only both here (the form is hidden below) and in the action
// itself (createSession still calls requireStaffSession("OWNER")).
export default async function StaffSessionsPage() {
  const session = await requireStaffSession("OWNER", "FRONT_DESK");
  const isOwner = session.role === "OWNER";

  const [doctors, sessions] = await Promise.all([
    isOwner
      ? prisma.doctor.findMany({ where: { clinicId: session.clinicId, isActive: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.session.findMany({
      where: { clinicId: session.clinicId },
      include: { doctor: { select: { name: true } } },
      orderBy: { sessionDate: "desc" },
      take: 20,
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Sessions" />

      {isOwner && <SessionForm doctors={doctors} />}

      {sessions.length === 0 ? (
        <EmptyState title="No sessions yet" description={isOwner ? "Create one above to get started." : "Ask the clinic owner to schedule a session."} />
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium text-foreground">{s.doctor.name}</div>
                  <div className="text-muted">
                    {formatClinicDate(s.sessionDate)} · {formatClinicTime(s.plannedStartAt)} –{" "}
                    {formatClinicTime(s.plannedEndAt)} · {s.locationLabel}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <SessionStatusBadge status={s.status} />
                    <Link href={`/app/queue/${s.id}`} className="text-sm text-primary underline underline-offset-2">
                      Manage queue
                    </Link>
                  </div>
                </div>
                <TransitionButtons sessionId={s.id} status={s.status} returnTo="/app/sessions" />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
