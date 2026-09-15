import type { Prisma } from "@/generated/prisma/client";
import { clinicDayBounds } from "@/lib/clinicDay";
import { readParam, type RawSearchParams } from "./searchParams";

// The filters a patient actually reaches for, beyond name and speciality.
//
// Each one is parsed leniently — a nonsense value means "no filter", never
// an error page. Discovery is the first thing a patient sees, and a
// hand-edited or stale URL should still show them doctors.
//
// Language is deliberately NOT a filter. Doctor.languagesText is free text
// ("English, Hindi, Marathi", "Hindi/Marathi", "hindi & english"), so a
// contains-match would silently miss doctors who do speak the language and
// would quietly mislead someone choosing a doctor on that basis. It needs a
// structured field first.

/** Ceiling for the fee filter, in rupees. Above this the filter is doing nothing. */
const MAX_FEE_RUPEES = 5000;
/** Nobody practises for 60 years; beyond this the filter excludes everyone. */
const MAX_EXPERIENCE_YEARS = 60;

export interface DiscoveryFilters {
  /** Only doctors with a session still to come today. */
  availableToday: boolean;
  /** Consultation fee ceiling, in whole rupees. */
  maxFeeRupees: number | null;
  /** Minimum years of experience. */
  minExperienceYears: number | null;
}


function parseBounded(raw: string | undefined, max: number): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return Math.min(value, max);
}

export function parseDiscoveryFilters(params: RawSearchParams): DiscoveryFilters {
  return {
    // Presence-based, like a checkbox: "today=1" and "today=on" (what an
    // unvalued HTML checkbox submits) both mean yes.
    availableToday: readParam(params, "today") !== undefined,
    maxFeeRupees: parseBounded(readParam(params, "maxFee"), MAX_FEE_RUPEES),
    minExperienceYears: parseBounded(readParam(params, "minExp"), MAX_EXPERIENCE_YEARS),
  };
}

export function hasAnyDiscoveryFilter(filters: DiscoveryFilters): boolean {
  return filters.availableToday || filters.maxFeeRupees !== null || filters.minExperienceYears !== null;
}

/**
 * "Still to come today": a session whose planned window has not finished
 * and which starts before the clinic day ends.
 *
 * Uses the planned window rather than sessionDate, which is a date-only
 * marker that has already caused off-by-one bugs elsewhere in this app. A
 * CLOSED or PAUSED session is excluded — a patient asking who is available
 * today means who they can still see.
 */
export function availableTodaySessionWhere(now: Date): Prisma.SessionWhereInput {
  const { end } = clinicDayBounds(now);
  return {
    status: { in: ["SCHEDULED", "OPEN", "IN_PROGRESS"] },
    plannedEndAt: { gte: now },
    plannedStartAt: { lt: end },
  };
}

/**
 * The filter clauses as a Doctor where-fragment, to merge into the
 * discovery query.
 *
 * Fee and experience are both nullable columns, and a comparison never
 * matches NULL — so filtering on either quietly excludes doctors who
 * simply have not recorded it. That is the correct behaviour for a
 * *ceiling* on fee (an unknown price cannot be promised to be under ₹500),
 * and it is stated in the UI rather than left to be discovered.
 */
export function buildDiscoveryFilterWhere(filters: DiscoveryFilters, now: Date): Prisma.DoctorWhereInput {
  return {
    ...(filters.availableToday ? { sessions: { some: availableTodaySessionWhere(now) } } : {}),
    ...(filters.maxFeeRupees !== null ? { consultationFeeMinor: { lte: filters.maxFeeRupees * 100 } } : {}),
    ...(filters.minExperienceYears !== null ? { experienceYears: { gte: filters.minExperienceYears } } : {}),
  };
}

/** The same "available today" idea, for a facility: any of its doctors. */
export function buildFacilityFilterWhere(filters: DiscoveryFilters, now: Date): Prisma.ClinicWhereInput {
  if (!filters.availableToday) return {};
  return { sessions: { some: availableTodaySessionWhere(now) } };
}

/** Fee options offered in the UI, in rupees. */
export const FEE_OPTIONS_RUPEES = [200, 500, 1000, 2000] as const;

/** Experience options offered in the UI, in years. */
export const EXPERIENCE_OPTIONS_YEARS = [5, 10, 15, 20] as const;
