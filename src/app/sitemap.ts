import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/env";
import { LISTED_CLINIC, LISTED_DOCTOR } from "@/lib/publicListing";

// The sitemap, built from what is actually listed.
//
// It goes through LISTED_DOCTOR / LISTED_CLINIC like every other public
// query, so a facility awaiting review — or one that was rejected, or has
// switched itself off — is never advertised to a search engine. Submitting
// a URL that 404s for everyone is worse than not submitting it.
//
// lastModified comes from the row's own updatedAt rather than "now", which
// is what makes it useful: a crawler can tell which of a thousand doctor
// pages actually changed.

// Sitemaps are capped at 50,000 URLs; this stays well under while the
// directory is small enough not to need an index file. Revisit with a
// sitemap index — not a bigger number — if the directory ever approaches it.
const MAX_URLS_PER_TYPE = 10_000;

// Generated per request, NOT prerendered at build time.
//
// `export const revalidate` made Next prerender this during `next build`,
// which meant the build required a reachable database — so a Neon cold
// start, a network blip, or a deploy that ran before the database was
// provisioned failed the whole build with DatabaseNotReachable. Coupling
// the ability to SHIP to the availability of a dependency is a bad trade
// for a file crawlers fetch a few times a day.
//
// A sitemap is also the one route where being a few minutes stale is
// harmless and being absent is not.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [doctors, facilities] = await Promise.all([
    prisma.doctor.findMany({
      where: LISTED_DOCTOR,
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_URLS_PER_TYPE,
    }),
    prisma.clinic.findMany({
      where: { ...LISTED_CLINIC, doctors: { some: { isActive: true } } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_URLS_PER_TYPE,
    }),
  ]);

  const now = new Date();

  // The three discovery entry points plus the homepage. Priorities are
  // relative hints only; the discovery routes outrank the marketing page
  // because they are what a patient searching for care should land on.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/doctors"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/clinics"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/hospitals"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];

  return [
    ...staticEntries,
    ...doctors.map((doctor) => ({
      url: absoluteUrl(`/doctors/${doctor.slug}`),
      lastModified: doctor.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...facilities.map((facility) => ({
      url: absoluteUrl(`/facilities/${facility.slug}`),
      lastModified: facility.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
