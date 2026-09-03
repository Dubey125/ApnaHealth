import type { Metadata } from "next";
import { parsePage } from "@/lib/discovery/pagination";
import { firstValue } from "@/lib/discovery/searchParams";
import { FacilityDiscovery } from "@/components/discovery/FacilityDiscovery";

interface ClinicsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// A thin route over the shared facility discovery component — /clinics and
// /hospitals differ only in which facilityType they ask for.
// Page-aware canonical: page 2 is different content from page 1, so it
// canonicalises to itself rather than collapsing into the first page.
export async function generateMetadata({ searchParams }: ClinicsPageProps): Promise<Metadata> {
  const page = parsePage(firstValue((await searchParams).page));
  const suffix = page > 1 ? ` — page ${page}` : "";
  return {
    title: `Find a clinic near you${suffix}`,
    description:
      "Browse verified clinics near you, see which doctors practise there and what they treat, and book a digital OPD token.",
    alternates: { canonical: page > 1 ? `/clinics?page=${page}` : "/clinics" },
  };
}

export default async function ClinicsPage({ searchParams }: ClinicsPageProps) {
  return <FacilityDiscovery facilityType="CLINIC" searchParams={await searchParams} />;
}
