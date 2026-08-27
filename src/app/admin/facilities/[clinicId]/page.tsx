import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApprovalStatusBadge, VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { waitingLabel } from "@/lib/admin/queue";
import { ReviewFacilityForm } from "./ReviewFacilityForm";

interface FacilityDetailPageProps {
  params: Promise<{ clinicId: string }>;
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

// Everything the facility told us at signup, on one page, because that is
// all a reviewer has to go on. No claim here is treated as verified — the
// page presents submitted details as submitted details, and the reviewer
// checks them against sources outside ApnaHealth.
export default async function AdminFacilityDetailPage({ params, searchParams }: FacilityDetailPageProps) {
  const { clinicId } = await params;
  const query = await searchParams;
  const justReviewed = query.reviewed === "1";

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: {
      reviewedByAdmin: { select: { name: true } },
      doctors: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, specialty: true, registrationNumber: true, verificationStatus: true },
      },
      staffUsers: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      },
    },
  });
  if (!clinic) {
    notFound();
  }

  const owners = clinic.staffUsers.filter((s) => s.role === "OWNER");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={clinic.name}
        backHref="/admin/facilities"
        backLabel="Facilities"
        action={<ApprovalStatusBadge status={clinic.approvalStatus} />}
      />

      {justReviewed && <Alert variant="success">Decision recorded.</Alert>}

      {clinic.approvalStatus === "PENDING" && (
        <Alert variant="warning">
          Not listed to patients yet. {waitingLabel(clinic.createdAt)}.
        </Alert>
      )}

      {clinic.approvalStatus !== "PENDING" && clinic.approvalDecidedAt && (
        <Alert variant={clinic.approvalStatus === "APPROVED" ? "success" : "danger"}>
          {clinic.approvalStatus === "APPROVED" ? "Approved" : "Rejected"} on{" "}
          {formatClinicDate(clinic.approvalDecidedAt)} at {formatClinicTime(clinic.approvalDecidedAt)}
          {clinic.reviewedByAdmin ? ` by ${clinic.reviewedByAdmin.name}` : ""}
          {clinic.approvalNotes ? ` — ${clinic.approvalNotes}` : ""}
        </Alert>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-foreground">Submitted details</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Facility type" value={clinic.facilityType === "HOSPITAL" ? "Hospital" : "Clinic"} />
          <Field label="Phone" value={clinic.phone} />
          <Field label="Address" value={clinic.addressLine} />
          <Field label="Area / locality" value={clinic.areaLabel} />
          <Field label="City" value={clinic.city} />
          <Field label="State" value={clinic.state} />
          <Field label="PIN code" value={clinic.postalCode} />
          <Field label="Signed up" value={`${formatClinicDate(clinic.createdAt)} ${formatClinicTime(clinic.createdAt)}`} />
        </dl>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Account holders</h2>
        {owners.length === 0 ? (
          <EmptyState title="No owner account" description="This facility has no one able to administer it." />
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {clinic.staffUsers.map((staff) => (
              <li key={staff.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{staff.name}</span>
                <span className="text-muted">{staff.email}</span>
                <span className="text-xs uppercase tracking-wide text-muted">{staff.role.replace(/_/g, " ")}</span>
                {!staff.isActive && <span className="text-xs text-danger">deactivated</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Doctors at this facility</h2>
        {clinic.doctors.length === 0 ? (
          <EmptyState title="No doctors added yet" />
        ) : (
          <ul className="flex flex-col gap-2">
            {clinic.doctors.map((doctor) => (
              <li key={doctor.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span className="flex flex-col">
                  <Link href={`/admin/doctors/${doctor.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                    {doctor.name}
                  </Link>
                  <span className="text-xs text-muted">
                    {doctor.specialty}
                    {doctor.registrationNumber ? ` · Reg# ${doctor.registrationNumber}` : " · no registration number given"}
                  </span>
                </span>
                <VerificationStatusBadge status={doctor.verificationStatus} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ReviewFacilityForm clinicId={clinic.id} currentStatus={clinic.approvalStatus} />
    </main>
  );
}
