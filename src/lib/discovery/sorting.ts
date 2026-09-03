import type { Prisma } from "@/generated/prisma/client";
import { readParam, type RawSearchParams } from "./searchParams";

// How a patient can order the doctor list.
//
// Four of the five sorts are a plain ORDER BY. "Soonest available" is not:
// a doctor's next session is the MIN of a related table, and Prisma has no
// way to order a findMany by a related aggregate. It is handled separately
// by the page (see loadDoctors), which is why the strategy is named here
// rather than expressed as an orderBy.

export type DoctorSort = "match" | "soonest" | "fee" | "experience" | "distance";

export const DOCTOR_SORTS: { value: DoctorSort; label: string; needsLocation?: boolean }[] = [
  { value: "match", label: "Best match" },
  { value: "distance", label: "Nearest first", needsLocation: true },
  { value: "soonest", label: "Soonest available" },
  { value: "fee", label: "Lowest fee" },
  { value: "experience", label: "Most experience" },
];

const VALID: readonly DoctorSort[] = ["match", "soonest", "fee", "experience", "distance"];

/**
 * The sort to apply, given what the URL asked for and whether a location is
 * active.
 *
 * Two coercions, both deliberate:
 *   * "distance" without a location has nothing to measure from, so it
 *     falls back to best match rather than erroring or silently doing
 *     nothing;
 *   * "match" WITH a location means nearest first — proximity is what "best
 *     match" means once someone has told us where they are, and it is what
 *     the page did before there was a sort control at all.
 */
export function parseDoctorSort(params: RawSearchParams, hasLocation: boolean): DoctorSort {
  const raw = readParam(params, "sort");
  const requested = VALID.includes(raw as DoctorSort) ? (raw as DoctorSort) : "match";

  if (requested === "distance" && !hasLocation) return "match";
  if (requested === "match" && hasLocation) return "distance";
  return requested;
}

/** Sorts the database can express directly. "match" and "distance" cannot. */
export function doctorOrderBy(sort: DoctorSort): Prisma.DoctorOrderByWithRelationInput[] | null {
  switch (sort) {
    case "fee":
      // nulls last: a doctor who has not published a fee is not the
      // cheapest, they are unknown, and putting them first would read as a
      // claim that they are free.
      return [{ consultationFeeMinor: { sort: "asc", nulls: "last" } }, { name: "asc" }];
    case "experience":
      return [{ experienceYears: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    default:
      return null;
  }
}

/**
 * Whether this sort needs the verified-first two-group split.
 *
 * Only "best match" does. Once a patient has asked for cheapest or most
 * experienced, reordering their answer by verification status would be
 * ignoring what they asked for.
 */
export function usesVerifiedRanking(sort: DoctorSort): boolean {
  return sort === "match";
}

/** The label to show for the active sort, for the results heading. */
export function doctorSortLabel(sort: DoctorSort): string {
  return DOCTOR_SORTS.find((option) => option.value === sort)?.label ?? "Best match";
}

export type FacilitySort = "match" | "distance" | "doctors";

export const FACILITY_SORTS: { value: FacilitySort; label: string; needsLocation?: boolean }[] = [
  { value: "match", label: "Best match" },
  { value: "distance", label: "Nearest first", needsLocation: true },
  { value: "doctors", label: "Most doctors" },
];

const VALID_FACILITY: readonly FacilitySort[] = ["match", "distance", "doctors"];

export function parseFacilitySort(params: RawSearchParams, hasLocation: boolean): FacilitySort {
  const raw = readParam(params, "sort");
  const requested = VALID_FACILITY.includes(raw as FacilitySort) ? (raw as FacilitySort) : "match";
  if (requested === "distance" && !hasLocation) return "match";
  if (requested === "match" && hasLocation) return "distance";
  return requested;
}

export function facilityOrderBy(sort: FacilitySort): Prisma.ClinicOrderByWithRelationInput[] {
  if (sort === "doctors") {
    // Prisma can order by a relation count, unlike a relation aggregate.
    return [{ doctors: { _count: "desc" } }, { name: "asc" }];
  }
  return [{ name: "asc" }];
}
