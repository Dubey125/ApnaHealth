import Link from "next/link";
import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";

export default async function StaffDoctorsPage() {
  const session = await requireStaffSession("OWNER");

  const doctors = await prisma.doctor.findMany({
    where: { clinicId: session.clinicId },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Doctors" />

      {doctors.length === 0 ? (
        <EmptyState title="No doctors yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Specialty</TableHead>
              <TableHead>Verification</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doctors.map((doctor) => (
              <TableRow key={doctor.id}>
                <TableCell className="font-medium text-foreground">
                  <Link href={`/app/doctors/${doctor.id}`} className="text-primary underline underline-offset-2">
                    {doctor.name}
                  </Link>
                  {!doctor.isActive && (
                    <Badge variant="neutral" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted">{doctor.specialty}</TableCell>
                <TableCell>
                  <VerificationStatusBadge status={doctor.verificationStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
