import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApprovalStatusBadge } from "@/components/ui/StatusBadge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { cn } from "@/components/ui/cn";
import { formatClinicDate } from "@/lib/format";
import { APPROVAL_FILTERS, needsAttention } from "@/lib/admin/queue";

export const metadata = { title: "Facilities — ApnaHealth Admin" };

const filterSchema = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() });

interface FacilitiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export default async function AdminFacilitiesPage({ searchParams }: FacilitiesPageProps) {
  const raw = await searchParams;
  const rawStatus = Array.isArray(raw.status) ? raw.status[0] : raw.status;
  const { status } = filterSchema.parse({ status: rawStatus });
  const now = new Date();

  const [clinics, counts] = await Promise.all([
    prisma.clinic.findMany({
      where: status ? { approvalStatus: status } : {},
      // Oldest first when reviewing the queue (that is the fair order to
      // work it), newest first when browsing decided facilities.
      orderBy: status === "PENDING" ? { createdAt: "asc" } : { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        facilityType: true,
        city: true,
        state: true,
        approvalStatus: true,
        createdAt: true,
        _count: { select: { doctors: true } },
      },
    }),
    prisma.clinic.groupBy({ by: ["approvalStatus"], _count: { _all: true } }),
  ]);

  const countFor = (value: string) => counts.find((c) => c.approvalStatus === value)?._count._all ?? 0;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Facilities"
        description="Every clinic and hospital on ApnaHealth, and where each one stands with review."
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/facilities"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
            !status
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground",
          )}
        >
          All
        </Link>
        {APPROVAL_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/admin/facilities?status=${value}`}
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

      {clinics.length === 0 ? (
        <EmptyState title="No facilities match this filter" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Facility</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Doctors</TableHead>
              <TableHead>Signed up</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clinics.map((clinic) => (
              <TableRow key={clinic.id}>
                <TableCell>
                  <Link href={`/admin/facilities/${clinic.id}`} className="font-medium text-foreground hover:text-primary">
                    {clinic.name}
                  </Link>
                  <div className="text-xs text-muted">{clinic.facilityType === "HOSPITAL" ? "Hospital" : "Clinic"}</div>
                </TableCell>
                <TableCell className="text-muted">
                  {clinic.city}, {clinic.state}
                </TableCell>
                <TableCell className="text-muted">{clinic._count.doctors}</TableCell>
                <TableCell className="whitespace-nowrap text-muted">
                  {formatClinicDate(clinic.createdAt)}
                  {clinic.approvalStatus === "PENDING" && needsAttention(clinic.createdAt, now) && (
                    <Badge variant="danger" className="ml-2">
                      Overdue
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <ApprovalStatusBadge status={clinic.approvalStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
