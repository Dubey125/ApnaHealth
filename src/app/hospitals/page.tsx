import type { Metadata } from "next";
import { parsePage } from "@/lib/discovery/pagination";
import { firstValue } from "@/lib/discovery/searchParams";
import { FacilityDiscovery } from "@/components/discovery/FacilityDiscovery";

interface HospitalsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Page-aware canonical: page 2 is different content from page 1, so it
// canonicalises to itself rather than collapsing into the first page.
export async function generateMetadata({ searchParams }: HospitalsPageProps): Promise<Metadata> {
  const page = parsePage(firstValue((await searchParams).page));
  const suffix = page > 1 ? ` — page ${page}` : "";
  return {
    title: `Find a hospital near you${suffix}`,
    description:
      "Browse hospitals near you, see their departments and doctors, and book a digital OPD token with live queue tracking.",
    alternates: { canonical: page > 1 ? `/hospitals?page=${page}` : "/hospitals" },
  };
}

export default async function HospitalsPage({ searchParams }: HospitalsPageProps) {
  return <FacilityDiscovery facilityType="HOSPITAL" searchParams={await searchParams} />;
}
