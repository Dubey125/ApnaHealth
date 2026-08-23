import Link from "next/link";
import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { StaffForm } from "./StaffForm";
import { CreatedToast } from "./CreatedToast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";

// Owner-only: creating StaffUser rows is inherently an owner-level action
// (see actions.ts). Before this phase, every StaffUser row only ever came
// from prisma/seed.ts — there was no UI for it at all.
export default async function StaffPage() {
  const session = await requireStaffSession("OWNER");

  const [staff, unlinkedDoctors] = await Promise.all([
    prisma.staffUser.findMany({
      where: { clinicId: session.clinicId },
      include: { doctor: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.doctor.findMany({
      where: { clinicId: session.clinicId, isActive: true, staffAccount: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <CreatedToast />
      <PageHeader title="Staff" />

      <StaffForm unlinkedDoctors={unlinkedDoctors} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium text-foreground">
                <Link href={`/app/staff/${s.id}`} className="text-primary underline underline-offset-2">
                  {s.name}
                </Link>
                {s.doctor && <div className="text-xs text-muted">{s.doctor.name}</div>}
              </TableCell>
              <TableCell className="text-muted">{s.email}</TableCell>
              <TableCell>
                <Badge variant="neutral">{s.role.replace("_", " ")}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={s.isActive ? "success" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
