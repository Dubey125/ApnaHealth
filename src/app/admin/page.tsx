import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { needsAttention, waitingLabel } from "@/lib/admin/queue";

export const metadata = { title: "Review queue · Admin" };

// The reviewer's home: the two things actually waiting on a human, and
// nothing else. Deliberately not a metrics dashboard — a queue that opens
// on totals rather than on the oldest unreviewed submission is a queue that
// grows quietly.
export default async function AdminHomePage() {
  const now = new Date();

  const [pendingFacilities, pendingDoctors, facilityCount, doctorCount, recentDecisions] = await Promise.all([
    prisma.clinic.findMany({
      where: { approvalStatus: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, name: true, facilityType: true, city: true, state: true, createdAt: true },
    }),
    prisma.doctor.findMany({
      // Only doctors at facilities that already cleared review: verifying a
      // doctor at a facility we have not accepted yet is work done in the
      // wrong order, and it would put a "Verified" badge on a profile that
      // may never be listed.
      where: { verificationStatus: "PENDING", clinic: { approvalStatus: "APPROVED" } },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: {
        id: true,
        name: true,
        specialty: true,
        registrationNumber: true,
        createdAt: true,
        clinic: { select: { name: true, city: true } },
      },
    }),
    prisma.clinic.count({ where: { approvalStatus: "PENDING" } }),
    prisma.doctor.count({ where: { verificationStatus: "PENDING", clinic: { approvalStatus: "APPROVED" } } }),
    prisma.adminEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 8,
      select: { id: true, action: true, entityType: true, occurredAt: true, admin: { select: { name: true } } },
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Review queue" description="Facilities and doctors waiting on a decision from the ApnaHealth team." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">Facilities awaiting approval</h2>
            <Badge variant={facilityCount > 0 ? "warning" : "neutral"}>{facilityCount}</Badge>
          </div>
          {pendingFacilities.length === 0 ? (
            <EmptyState title="Nothing waiting" description="Every facility that has signed up has been reviewed." />
          ) : (
            <ul className="flex flex-col gap-2">
              {pendingFacilities.map((clinic) => (
                <li key={clinic.id}>
                  <Link
                    href={`/admin/facilities/${clinic.id}`}
                    className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 transition-colors hover:border-primary/40"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {clinic.name}
                      <Badge variant="neutral">{clinic.facilityType === "HOSPITAL" ? "Hospital" : "Clinic"}</Badge>
                      {needsAttention(clinic.createdAt, now) && <Badge variant="danger">Overdue</Badge>}
                    </span>
                    <span className="text-xs text-muted">
                      {clinic.city}, {clinic.state} · {waitingLabel(clinic.createdAt, now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/facilities" className="text-sm font-medium text-primary underline underline-offset-2">
            All facilities
          </Link>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">Doctors awaiting verification</h2>
            <Badge variant={doctorCount > 0 ? "warning" : "neutral"}>{doctorCount}</Badge>
          </div>
          {pendingDoctors.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              description="Doctors at approved facilities have all had a registration check recorded."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {pendingDoctors.map((doctor) => (
                <li key={doctor.id}>
                  <Link
                    href={`/admin/doctors/${doctor.id}`}
                    className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 transition-colors hover:border-primary/40"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {doctor.name}
                      {!doctor.registrationNumber && <Badge variant="danger">No reg. number</Badge>}
                      {needsAttention(doctor.createdAt, now) && <Badge variant="danger">Overdue</Badge>}
                    </span>
                    <span className="text-xs text-muted">
                      {doctor.specialty} · {doctor.clinic.name}, {doctor.clinic.city} ·{" "}
                      {waitingLabel(doctor.createdAt, now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/doctors" className="text-sm font-medium text-primary underline underline-offset-2">
            All doctors
          </Link>
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Recent decisions</h2>
        {recentDecisions.length === 0 ? (
          <EmptyState title="No decisions recorded yet" />
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {recentDecisions.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-2 text-muted">
                <span className="whitespace-nowrap text-xs">
                  {formatClinicDate(event.occurredAt)} {formatClinicTime(event.occurredAt)}
                </span>
                <span className="text-foreground">{event.action.replace(/_/g, " ").toLowerCase()}</span>
                <span className="text-xs">by {event.admin.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
