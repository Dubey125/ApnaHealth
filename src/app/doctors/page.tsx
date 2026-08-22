import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";

const filtersSchema = z.object({
  specialty: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
});

interface DoctorsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DoctorsPage({ searchParams }: DoctorsPageProps) {
  const rawParams = await searchParams;
  const filters = filtersSchema.parse({
    specialty: firstValue(rawParams.specialty),
    name: firstValue(rawParams.name),
    city: firstValue(rawParams.city),
  });
  const hasFilters = Boolean(filters.name || filters.specialty || filters.city);

  const doctors = await prisma.doctor.findMany({
    where: {
      isActive: true,
      clinic: {
        isActive: true,
        ...(filters.city ? { city: { contains: filters.city, mode: "insensitive" } } : {}),
      },
      ...(filters.specialty ? { specialty: { contains: filters.specialty, mode: "insensitive" } } : {}),
      ...(filters.name ? { name: { contains: filters.name, mode: "insensitive" } } : {}),
    },
    include: { clinic: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Find a doctor</h1>

        <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Input name="name" defaultValue={filters.name} placeholder="Doctor name" className="sm:w-48" />
          <Input name="specialty" defaultValue={filters.specialty} placeholder="Specialty" className="sm:w-48" />
          <Input name="city" defaultValue={filters.city} placeholder="City" className="sm:w-40" />
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Search
          </button>
        </form>

        {doctors.length === 0 ? (
          <EmptyState
            title="No doctors match those filters"
            description={hasFilters ? "Try a different name, specialty or city." : "No doctors are listed yet."}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {doctors.map((doctor) => (
              <li key={doctor.id}>
                <Link href={`/doctors/${doctor.slug}`}>
                  <Card className="flex flex-col gap-1 transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{doctor.name}</span>
                      {doctor.verificationStatus === "VERIFIED" && (
                        <VerificationStatusBadge status={doctor.verificationStatus} />
                      )}
                    </div>
                    <span className="text-sm text-muted">{doctor.specialty}</span>
                    <span className="text-sm text-muted">
                      {doctor.clinic.name} · {doctor.clinic.city}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
