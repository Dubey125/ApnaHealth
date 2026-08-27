import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { cn } from "@/components/ui/cn";
import { formatClinicDate } from "@/lib/format";
import { VERIFICATION_FILTERS, needsAttention } from "@/lib/admin/queue";

export const metadata = { title: "Doctors — ApnaHealth Admin" };

const filterSchema = z.object({ status: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional() });

interface AdminDoctorsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Unverified",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export default async function AdminDoctorsPage({ searchParams }: AdminDoctorsPageProps) {
  const raw = await searchParams;
  const rawStatus = Array.isArray(raw.status) ? raw.status[0] : raw.status;
  const { status } = filterSchema.parse({ status: rawStatus });
  const now = new Date();

  const [doctors, counts] = await Promise.all([
    prisma.doctor.findMany({
      where: status ? { verificationStatus: status } : {},
      orderBy: status === "PENDING" ? { createdAt: "asc" } : { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        specialty: true,
        registrationNumber: true,
        registrationCouncil: true,
        verificationStatus: true,
        createdAt: true,
        clinic: { select: { id: true, name: true, city: true, approvalStatus: true } },
      },
    }),
    prisma.doctor.groupBy({ by: ["verificationStatus"], _count: { _all: true } }),
  ]);

  const countFor = (value: string) => counts.find((c) => c.verificationStatus === value)?._count._all ?? 0;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Doctors"
        description="Medical registration checks. A doctor is unverified until someone here records a real check against a real source — never automatically."
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/doctors"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
            !status
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
          )}
        >
          All
        </Link>
        {VERIFICATION_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/admin/doctors?status=${value}`}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              status === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
            )}
          >
            {STATUS_LABEL[value]}
            <span className="text-xs opacity-80">{countFor(value)}</span>
          </Link>
        ))}
      </div>

      {doctors.length === 0 ? (
        <EmptyState title="No doctors match this filter" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doctor</TableHead>
              <TableHead>Registration</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doctors.map((doctor) => (
              <TableRow key={doctor.id}>
                <TableCell>
                  <Link href={`/admin/doctors/${doctor.id}`} className="font-medium text-foreground hover:text-primary">
                    {doctor.name}
                  </Link>
                  <div className="text-xs text-muted">{doctor.specialty}</div>
                </TableCell>
                <TableCell className="text-muted">
                  {doctor.registrationNumber ? (
                    <>
                      {doctor.registrationNumber}
                      <div className="text-xs">{doctor.registrationCouncil ?? "council not given"}</div>
                    </>
                  ) : (
                    <Badge variant="danger">Not given</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted">
                  <Link href={`/admin/facilities/${doctor.clinic.id}`} className="hover:text-primary">
                    {doctor.clinic.name}
                  </Link>
                  <div className="text-xs">
                    {doctor.clinic.city}
                    {doctor.clinic.approvalStatus !== "APPROVED" && (
                      <span className="text-warning"> · facility {doctor.clinic.approvalStatus.toLowerCase()}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted">
                  {formatClinicDate(doctor.createdAt)}
                  {doctor.verificationStatus === "PENDING" && needsAttention(doctor.createdAt, now) && (
                    <Badge variant="danger" className="ml-2">
                      Overdue
                    </Badge>
                  )}
                </TableCell>
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
