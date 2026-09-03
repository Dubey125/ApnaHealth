import { slugify } from "@/lib/slugify";

// The public identifier for /facilities/[slug].
//
// Same reasoning as Doctor.slug: internal ids never go into public URLs
// (DATA_MODEL.md), and a facility now has a public page of its own, so it
// needs a non-internal identifier to be reached by.
//
// The city is part of the base because facility names are not distinctive
// on their own — "City Hospital" and "Life Care Clinic" recur in every
// Indian metro — and a slug of just the name would send the second one to
// a numeric suffix for no reason a patient could understand.

/** "Sunrise Multispeciality" in Pune → "sunrise-multispeciality-pune". */
export function buildClinicSlugBase(name: string, city: string): string {
  const base = slugify(`${name} ${city}`);
  // A name made entirely of characters slugify strips (e.g. Devanagari
  // only) would otherwise produce "", which is not a URL.
  return base.length > 0 ? base : "facility";
}

/**
 * First free slug in the base, base-2, base-3… series.
 *
 * `exists` is injected so the collision logic is testable without a
 * database, and so the same function serves the two signup actions and the
 * seed, which each hold a different Prisma client.
 */
export async function nextAvailableSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await exists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function uniqueClinicSlug(
  name: string,
  city: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  return nextAvailableSlug(buildClinicSlugBase(name, city), exists);
}
