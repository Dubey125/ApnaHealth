import { z } from "zod";

// Vitals, stored as measurements instead of prose.
//
// The consultation form has always collected blood pressure, pulse,
// temperature, SpO2 and weight — and then flattened them into a string
// inside clinicalAssessment:
//
//   [Vitals: BP: 130/85 mmHg · Pulse: 78 bpm · Weight: 72 kg]
//
// That captures the numbers and destroys them as data in the same motion.
// A doctor cannot see that a patient's blood pressure has climbed across
// four visits, because "130/85" is sitting in the middle of a paragraph.
// Nothing can chart it, compare it, or carry it forward.
//
// This module is the contract for recording them properly. It is pure, so
// the rules can be tested without a database.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT THIS DELIBERATELY DOES NOT DO
//
// It never judges a reading. There is no "high", no "low", no warning,
// no colour-coding by severity, and no threshold that means anything
// clinical. A blood pressure of 160/100 is stored and displayed exactly
// as neutrally as 120/80.
//
// That is not an oversight. Interpreting a vital sign is a clinical
// decision, and CLAUDE.md's product safety boundary puts those with the
// clinician, not the software. The system's job is to remember the number
// accurately and show it alongside the others so the person qualified to
// read it can.
//
// The bounds below exist only to reject impossible DATA — a pulse of 1200
// is a typo, not a patient — never to comment on a plausible one.
// ─────────────────────────────────────────────────────────────────────

/**
 * Physiologically possible bounds, deliberately wide.
 *
 * These catch a slipped finger, not an unwell patient. Each is set well
 * outside anything a living person would present with, because a range
 * that rejects a real (if alarming) reading would force a clinician to
 * either lie to the form or abandon it — and an abandoned vitals field
 * records nothing at all.
 */
export const VITAL_RANGES = {
  bloodPressureSystolic: { min: 40, max: 300, unit: "mmHg" },
  bloodPressureDiastolic: { min: 20, max: 200, unit: "mmHg" },
  pulseBpm: { min: 20, max: 300, unit: "bpm" },
  temperatureF: { min: 80, max: 115, unit: "°F" },
  spo2Percent: { min: 50, max: 100, unit: "%" },
  weightKg: { min: 0.3, max: 500, unit: "kg" },
} as const;

export type VitalKey = keyof typeof VITAL_RANGES;

export interface Vitals {
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  pulseBpm: number | null;
  temperatureF: number | null;
  spo2Percent: number | null;
  weightKg: number | null;
}

export const EMPTY_VITALS: Vitals = {
  bloodPressureSystolic: null,
  bloodPressureDiastolic: null,
  pulseBpm: null,
  temperatureF: null,
  spo2Percent: null,
  weightKg: null,
};

/**
 * An optional measurement from a form field.
 *
 * Empty is undefined, not zero. `z.coerce.number()` turns "" into 0, and a
 * recorded pulse of zero is a very different claim from an unrecorded one
 * — the same trap the location search params had to work around.
 */
function optionalMeasurement(key: VitalKey, integer: boolean) {
  const { min, max } = VITAL_RANGES[key];
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) return undefined;
      const text = String(value).trim();
      return text.length === 0 ? undefined : Number(text);
    },
    (integer ? z.number().int() : z.number()).min(min).max(max).optional(),
  );
}

export const vitalsSchema = z
  .object({
    bloodPressureSystolic: optionalMeasurement("bloodPressureSystolic", true),
    bloodPressureDiastolic: optionalMeasurement("bloodPressureDiastolic", true),
    pulseBpm: optionalMeasurement("pulseBpm", true),
    temperatureF: optionalMeasurement("temperatureF", false),
    spo2Percent: optionalMeasurement("spo2Percent", true),
    weightKg: optionalMeasurement("weightKg", false),
  })
  // Blood pressure is one measurement written as two numbers. Half of it
  // is not a lower-quality reading, it is not a reading — the same
  // both-or-neither rule the coordinate fields use.
  .refine(
    (v) =>
      (v.bloodPressureSystolic === undefined) === (v.bloodPressureDiastolic === undefined),
    { message: "Record both blood pressure numbers, or neither.", path: ["bloodPressureSystolic"] },
  )
  // Systolic below diastolic is a transposition, not a patient.
  .refine(
    (v) =>
      v.bloodPressureSystolic === undefined ||
      v.bloodPressureDiastolic === undefined ||
      v.bloodPressureSystolic > v.bloodPressureDiastolic,
    { message: "Systolic must be higher than diastolic — check the two numbers.", path: ["bloodPressureSystolic"] },
  );

export type VitalsInput = z.infer<typeof vitalsSchema>;

/** Undefined (absent from a form) becomes null (absent in the database). */
export function toStoredVitals(input: VitalsInput): Vitals {
  return {
    bloodPressureSystolic: input.bloodPressureSystolic ?? null,
    bloodPressureDiastolic: input.bloodPressureDiastolic ?? null,
    pulseBpm: input.pulseBpm ?? null,
    // Rounded on the way in. Clinicians read temperature and weight to one
    // decimal place, and storing 98.60000000000001 would put a float
    // artefact into a medical record.
    temperatureF: input.temperatureF === undefined ? null : Math.round(input.temperatureF * 10) / 10,
    spo2Percent: input.spo2Percent ?? null,
    weightKg: input.weightKg === undefined ? null : Math.round(input.weightKg * 10) / 10,
  };
}

/** Whether anything was recorded at all. */
export function hasAnyVital(vitals: Vitals): boolean {
  return Object.values(vitals).some((value) => value !== null);
}

export interface VitalDisplay {
  key: VitalKey | "bloodPressure";
  label: string;
  value: string;
}

/**
 * Vitals as display rows, in the order a clinician reads them.
 *
 * Blood pressure is collapsed back into one row, because that is how it is
 * spoken and written even though it is stored as two columns.
 *
 * Only recorded values appear. A blank row invites being read as zero,
 * and "we did not measure this" is a different fact from any number.
 */
export function displayVitals(vitals: Vitals): VitalDisplay[] {
  const rows: VitalDisplay[] = [];

  if (vitals.bloodPressureSystolic !== null && vitals.bloodPressureDiastolic !== null) {
    rows.push({
      key: "bloodPressure",
      label: "BP",
      value: `${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic} mmHg`,
    });
  }
  if (vitals.pulseBpm !== null) rows.push({ key: "pulseBpm", label: "Pulse", value: `${vitals.pulseBpm} bpm` });
  if (vitals.temperatureF !== null) {
    rows.push({ key: "temperatureF", label: "Temp", value: `${vitals.temperatureF} °F` });
  }
  if (vitals.spo2Percent !== null) rows.push({ key: "spo2Percent", label: "SpO₂", value: `${vitals.spo2Percent}%` });
  if (vitals.weightKg !== null) rows.push({ key: "weightKg", label: "Weight", value: `${vitals.weightKg} kg` });

  return rows;
}

export interface VitalsTrendPoint {
  consultedAt: Date;
  vitals: Vitals;
}

export interface VitalsSeries {
  key: VitalKey | "bloodPressure";
  label: string;
  /** Oldest first, so a reader scans left to right through time. */
  points: { consultedAt: Date; value: string }[];
}

/**
 * Past readings of each vital, for the visits that recorded it.
 *
 * A series with fewer than two points is dropped: one reading is already
 * shown on the visit it belongs to, and presenting it as a "trend" implies
 * a direction that a single measurement cannot have.
 *
 * Returns values as formatted strings rather than numbers. Nothing here
 * computes a delta, a direction or a rate of change — those are readings
 * to compare, and comparing them is the clinician's job.
 */
export function vitalsTrend(history: VitalsTrendPoint[]): VitalsSeries[] {
  const chronological = [...history].sort((a, b) => a.consultedAt.getTime() - b.consultedAt.getTime());

  const series = new Map<string, VitalsSeries>();
  for (const entry of chronological) {
    for (const row of displayVitals(entry.vitals)) {
      const existing = series.get(row.key);
      const point = { consultedAt: entry.consultedAt, value: row.value };
      if (existing) existing.points.push(point);
      else series.set(row.key, { key: row.key, label: row.label, points: [point] });
    }
  }

  return [...series.values()].filter((s) => s.points.length >= 2);
}

/**
 * Trend points from consultation records.
 *
 * A ConsultationRecord carries the vitals flat alongside its clinical text;
 * the trend wants them grouped with their date. Converting here rather than
 * at each call site keeps every caller reading the same shape, and means a
 * new vital is added in one place instead of three.
 */
export function trendPointsFrom(records: (Vitals & { consultedAt: Date })[]): VitalsTrendPoint[] {
  return records.map((record) => ({
    consultedAt: record.consultedAt,
    vitals: {
      bloodPressureSystolic: record.bloodPressureSystolic,
      bloodPressureDiastolic: record.bloodPressureDiastolic,
      pulseBpm: record.pulseBpm,
      temperatureF: record.temperatureF,
      spo2Percent: record.spo2Percent,
      weightKg: record.weightKg,
    },
  }));
}
