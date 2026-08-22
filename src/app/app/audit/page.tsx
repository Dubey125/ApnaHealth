import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";

const PAGE_SIZE = 50;

// Owner-only (ACCESS_MATRIX.md: "View audit logs" is Owner ✅, Doctor
// "limited" — a doctor-scoped filtered view isn't built here; flagging
// that as a known gap rather than silently expanding this phase's scope).
// AuditEvent rows already exist (written by doctor verification and, as of
// this phase, staff creation) but had no viewer anywhere until now.
export default async function AuditPage() {
  const session = await requireStaffSession("OWNER");

  const events = await prisma.auditEvent.findMany({
    where: { clinicId: session.clinicId },
    orderBy: { occurredAt: "desc" },
    take: PAGE_SIZE,
  });

  // actorUserId is intentionally not a foreign key (see the model comment
  // in schema.prisma — the actor may be a StaffUser or a Patient), so
  // names are resolved with a best-effort lookup rather than an include.
  const actorIds = [...new Set(events.map((e) => e.actorUserId).filter((id): id is string => !!id))];
  const actors = actorIds.length > 0 ? await prisma.staffUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Audit log" />

      {events.length === 0 ? (
        <EmptyState title="No audit events yet" description="Actions like doctor verification and staff creation will appear here." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-muted">
                    {formatClinicDate(event.occurredAt)} {formatClinicTime(event.occurredAt)}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {event.actorUserId ? (actorNameById.get(event.actorUserId) ?? event.actorUserId) : "—"}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{event.action.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-muted">
                    {event.entityType}
                    {event.entityId ? ` · ${event.entityId}` : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {events.length === PAGE_SIZE && (
            <p className="text-xs text-muted">Showing the most recent {PAGE_SIZE} events.</p>
          )}
        </>
      )}
    </main>
  );
}
