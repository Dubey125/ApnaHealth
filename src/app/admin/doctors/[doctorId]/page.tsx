import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { VerificationForm } from "./VerificationForm";

interface AdminDoctorDetailPageProps {
  params: Promise<{ doctorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-foreground">{value?.trim() ? value : <span className="text-muted">Not provided</span>}</dd>
    </div>
  );
}

export default async function AdminDoctorDetailPage({ params, searchParams }: AdminDoctorDetailPageProps) {
  const { doctorId } = await params;
  const query = await searchParams;
  const justReviewed = query.reviewed === "1";

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: {
      clinic: { select: { id: true, name: true, city: true, state: true, approvalStatus: true } },
      verifications: {
        orderBy: { checkedAt: "desc" },
        include: {
          checkedByStaffUser: { select: { name: true } },
          checkedByAdmin: { select: { name: true } },
        },
      },
    },
  });
  if (!doctor) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={doctor.name}
        backHref="/admin/doctors"
        backLabel="Doctors"
        action={<VerificationStatusBadge status={doctor.verificationStatus} />}
      />

      {justReviewed && <Alert variant="success">Verification check recorded.</Alert>}

      {doctor.clinic.approvalStatus !== "APPROVED" && (
        <Alert variant="warning">
          This doctor&apos;s facility is {doctor.clinic.approvalStatus === "PENDING" ? "still awaiting review" : "rejected"}, so
          the profile is not listed to patients regardless of this check.{" "}
          <Link href={`/admin/facilities/${doctor.clinic.id}`} className="font-medium underline underline-offset-2">
            Review the facility
          </Link>
          .
        </Alert>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-foreground">Claimed by the doctor</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Specialty" value={doctor.specialty} />
          <Field label="Qualification" value={doctor.qualificationText} />
          <Field label="Registration number" value={doctor.registrationNumber} />
          <Field label="Registration council" value={doctor.registrationCouncil} />
          <Field label="Contact phone" value={doctor.phone} />
          <Field label="Contact email" value={doctor.email} />
          <Field
            label="Practice"
            value={`${doctor.clinic.name} — ${doctor.clinic.city}, ${doctor.clinic.state}`}
          />
          <Field label="Added" value={`${formatClinicDate(doctor.createdAt)} ${formatClinicTime(doctor.createdAt)}`} />
        </dl>
        <p className="text-xs text-muted">
          These are the doctor&apos;s own submissions. Nothing on this card has been confirmed by anyone.
        </p>
      </Card>

      <VerificationForm doctorId={doctor.id} claimedRegistrationNumber={doctor.registrationNumber} />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Verification history</h2>
        {doctor.verifications.length === 0 ? (
          <EmptyState title="No verification checks recorded yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Checked against</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doctor.verifications.map((entry) => (
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
                    {/* Historic rows were recorded by a clinic owner, before
                        verification moved to the platform. Showing which is
                        which is the point of keeping both columns. */}
                    {entry.checkedByAdmin ? (
                      <>
                        {entry.checkedByAdmin.name}
                        <div className="text-xs">ApnaHealth review team</div>
                      </>
                    ) : entry.checkedByStaffUser ? (
                      <>
                        {entry.checkedByStaffUser.name}
                        <div className="text-xs">clinic staff (historic)</div>
                      </>
                    ) : (
                      <span className="text-xs">unknown</span>
                    )}
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
