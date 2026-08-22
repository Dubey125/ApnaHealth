import { notFound } from "next/navigation";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { VerificationForm } from "../VerificationForm";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";

interface DoctorDetailPageProps {
  params: Promise<{ doctorId: string }>;
}

export default async function DoctorDetailPage({ params }: DoctorDetailPageProps) {
  const session = await requireStaffSession("OWNER");
  const { doctorId } = await params;

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    notFound();
  }
  assertClinicAccess(session, doctor.clinicId);

  const history = await prisma.doctorVerification.findMany({
    where: { doctorId: doctor.id },
    orderBy: { checkedAt: "desc" },
    include: { checkedByStaffUser: { select: { name: true } } },
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={doctor.name}
        backHref="/app/doctors"
        backLabel="Doctors"
        action={<VerificationStatusBadge status={doctor.verificationStatus} />}
      />

      <VerificationForm doctorId={doctor.id} />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Verification history</h2>
        {history.length === 0 ? (
          <EmptyState title="No verification checks recorded yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Checked against</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-muted">
                    {formatClinicDate(entry.checkedAt)} {formatClinicTime(entry.checkedAt)}
                  </TableCell>
                  <TableCell>
                    <VerificationStatusBadge status={entry.status} />
                  </TableCell>
                  <TableCell className="text-muted">
                    Reg# {entry.registrationNumberChecked} · {entry.sourceName}
                    {entry.sourceReference ? ` (${entry.sourceReference})` : ""}
                    {entry.notes && <div className="text-xs">Notes: {entry.notes}</div>}
                  </TableCell>
                  <TableCell className="text-muted">{entry.checkedByStaffUser.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </main>
  );
}
