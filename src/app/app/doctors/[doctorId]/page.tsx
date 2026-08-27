import { notFound } from "next/navigation";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";

interface DoctorDetailPageProps {
  params: Promise<{ doctorId: string }>;
}

// Read-only as far as verification goes. This page used to carry a form
// that let a clinic OWNER set a doctor's verificationStatus directly —
// which self-signup turned into self-verification, because a doctor who
// registers becomes the OWNER of their own practice and could then mark
// their own medical registration verified. CLAUDE.md is explicit that
// verification "must never be fabricated or treated as automatic truth",
// so the decision moved to the platform review team (/admin/doctors) and
// what remains here is the status and its history.
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
    include: {
      checkedByStaffUser: { select: { name: true } },
      checkedByAdmin: { select: { name: true } },
    },
  });

  const missingRegistration = !doctor.registrationNumber || !doctor.registrationCouncil;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={doctor.name}
        backHref="/app/doctors"
        backLabel="Doctors"
        action={<VerificationStatusBadge status={doctor.verificationStatus} />}
      />

      {doctor.verificationStatus === "PENDING" && (
        <Alert variant="warning">
          <strong className="font-medium">Awaiting verification by the ApnaHealth team.</strong> The profile is listed and
          bookable, but shows no verified badge until a registration check is recorded.
          {missingRegistration && " Add the medical registration number and council below — a check can't be done without them."}
        </Alert>
      )}

      {doctor.verificationStatus === "REJECTED" && (
        <Alert variant="danger">
          <strong className="font-medium">Verification was not successful.</strong>
          {doctor.verificationNotes ? ` ${doctor.verificationNotes}` : " Correct the registration details and they will be re-checked."}
        </Alert>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Medical registration</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs uppercase tracking-wide text-muted">Registration number</dt>
            <dd className="text-sm text-foreground">
              {doctor.registrationNumber ?? <span className="text-muted">Not provided</span>}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs uppercase tracking-wide text-muted">Council</dt>
            <dd className="text-sm text-foreground">
              {doctor.registrationCouncil ?? <span className="text-muted">Not provided</span>}
            </dd>
          </div>
          {doctor.verifiedAt && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-wide text-muted">Verified on</dt>
              <dd className="text-sm text-foreground">
                {formatClinicDate(doctor.verifiedAt)} {formatClinicTime(doctor.verifiedAt)}
              </dd>
            </div>
          )}
          {doctor.verificationSource && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-wide text-muted">Checked against</dt>
              <dd className="text-sm text-foreground">{doctor.verificationSource}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-muted">
          Verification is carried out by the ApnaHealth review team against the issuing medical council. Clinics and
          doctors can&apos;t set their own verified status.
        </p>
      </Card>

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
                  <TableCell className="text-muted">
                    {entry.checkedByAdmin?.name ?? entry.checkedByStaffUser?.name ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </main>
  );
}
