import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_VITALS,
  VITAL_RANGES,
  displayVitals,
  hasAnyVital,
  toStoredVitals,
  vitalsSchema,
  vitalsTrend,
  type Vitals,
} from "./vitals";

const parse = (input: Record<string, unknown>) => vitalsSchema.safeParse(input);
const vitals = (overrides: Partial<Vitals> = {}): Vitals => ({ ...EMPTY_VITALS, ...overrides });

// --- Absent is not zero ---

test("an empty field is unrecorded, not a reading of zero", () => {
  // The trap z.coerce.number() sets: "" becomes 0, and a recorded pulse of
  // zero is a very different claim from an unmeasured one.
  const result = parse({ pulseBpm: "", weightKg: "   ", spo2Percent: undefined });
  assert.ok(result.success);
  assert.equal(result.data.pulseBpm, undefined);
  assert.equal(result.data.weightKg, undefined);
  assert.equal(toStoredVitals(result.data).pulseBpm, null, "unrecorded must reach the database as null");
});

test("a form with nothing filled in is valid and records nothing", () => {
  const result = parse({});
  assert.ok(result.success);
  assert.equal(hasAnyVital(toStoredVitals(result.data)), false);
});

// --- Impossible data is rejected; alarming data is not ---

test("a plainly impossible reading is rejected", () => {
  assert.equal(parse({ pulseBpm: "1200" }).success, false, "a typo, not a patient");
  assert.equal(parse({ spo2Percent: "140" }).success, false, "SpO2 cannot exceed 100");
  assert.equal(parse({ temperatureF: "300" }).success, false);
  assert.equal(parse({ weightKg: "0" }).success, false);
});

test("an alarming but real reading is accepted without comment", () => {
  // The boundary that matters. A hypertensive crisis, a fever and a low
  // oxygen saturation are all real things a patient presents with. The
  // form must record them, not argue — interpreting them is the
  // clinician's job, and a range that rejected them would make the field
  // useless exactly when it matters most.
  const result = parse({
    bloodPressureSystolic: "210",
    bloodPressureDiastolic: "130",
    pulseBpm: "180",
    temperatureF: "104.5",
    spo2Percent: "82",
  });
  assert.ok(result.success, "a severely unwell patient must still be recordable");
});

test("the accepted range sits well outside anything survivable", () => {
  // Guards against someone later "tightening" these into clinical
  // thresholds, which would turn data validation into a medical opinion.
  assert.ok(VITAL_RANGES.bloodPressureSystolic.max >= 250);
  assert.ok(VITAL_RANGES.spo2Percent.min <= 60);
  assert.ok(VITAL_RANGES.pulseBpm.max >= 250);
});

// --- Blood pressure is one measurement ---

test("half a blood pressure is not a reading", () => {
  assert.equal(parse({ bloodPressureSystolic: "120" }).success, false);
  assert.equal(parse({ bloodPressureDiastolic: "80" }).success, false);
  assert.ok(parse({ bloodPressureSystolic: "120", bloodPressureDiastolic: "80" }).success);
});

test("a transposed blood pressure is caught", () => {
  // 80/120 is someone typing the numbers the wrong way round.
  const result = parse({ bloodPressureSystolic: "80", bloodPressureDiastolic: "120" });
  assert.equal(result.success, false);
});

// --- Storage ---

test("temperature and weight are rounded, so no float artefact enters a medical record", () => {
  const stored = toStoredVitals({ temperatureF: 98.6000000001, weightKg: 72.34 });
  assert.equal(stored.temperatureF, 98.6);
  assert.equal(stored.weightKg, 72.3);
});

test("integers-only vitals reject a fractional reading", () => {
  assert.equal(parse({ pulseBpm: "78.5" }).success, false);
  assert.ok(parse({ temperatureF: "98.6" }).success, "temperature is legitimately fractional");
});

// --- Display ---

test("only recorded vitals are displayed", () => {
  // A blank row invites being read as zero, and "not measured" is a
  // different fact from any number.
  const rows = displayVitals(vitals({ pulseBpm: 78 }));
  assert.deepEqual(rows.map((r) => r.key), ["pulseBpm"]);
});

test("blood pressure displays as one reading, the way it is spoken", () => {
  const rows = displayVitals(vitals({ bloodPressureSystolic: 130, bloodPressureDiastolic: 85 }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, "130/85 mmHg");
});

test("display carries units, because a bare number is ambiguous", () => {
  const rows = displayVitals(vitals({ pulseBpm: 78, temperatureF: 98.6, spo2Percent: 97, weightKg: 72.3 }));
  for (const row of rows) {
    assert.match(row.value, /[a-z°%]/i, `${row.label} should carry a unit`);
  }
});

test("nothing in the display layer judges a reading", () => {
  // A severe reading and a normal one must render identically in form —
  // same shape, same fields, no extra marker. If someone later adds a
  // severity flag, this fails.
  const normal = displayVitals(vitals({ bloodPressureSystolic: 120, bloodPressureDiastolic: 80 }));
  const severe = displayVitals(vitals({ bloodPressureSystolic: 210, bloodPressureDiastolic: 130 }));
  assert.deepEqual(Object.keys(normal[0]), Object.keys(severe[0]));
  assert.equal(normal.length, severe.length);
});

// --- Trend ---

const at = (iso: string, v: Partial<Vitals>): { consultedAt: Date; vitals: Vitals } => ({
  consultedAt: new Date(iso),
  vitals: vitals(v),
});

test("a trend is ordered oldest first, so it reads left to right through time", () => {
  const series = vitalsTrend([
    at("2026-03-01T10:00:00Z", { pulseBpm: 80 }),
    at("2026-01-01T10:00:00Z", { pulseBpm: 72 }),
    at("2026-02-01T10:00:00Z", { pulseBpm: 76 }),
  ]);
  assert.equal(series.length, 1);
  assert.deepEqual(series[0].points.map((p) => p.value), ["72 bpm", "76 bpm", "80 bpm"]);
});

test("a single reading is not a trend", () => {
  // One measurement has no direction, and presenting it as a trend implies
  // one. It is already shown on the visit it belongs to.
  assert.deepEqual(vitalsTrend([at("2026-01-01T10:00:00Z", { pulseBpm: 72 })]), []);
});

test("each vital trends independently, over the visits that recorded it", () => {
  // Real clinics do not record every vital every time. A patient weighed
  // twice and pulsed three times should produce both series, not neither.
  const series = vitalsTrend([
    at("2026-01-01T10:00:00Z", { pulseBpm: 72, weightKg: 70 }),
    at("2026-02-01T10:00:00Z", { pulseBpm: 76 }),
    at("2026-03-01T10:00:00Z", { pulseBpm: 80, weightKg: 72 }),
  ]);
  const byKey = Object.fromEntries(series.map((s) => [s.key, s.points.length]));
  assert.equal(byKey.pulseBpm, 3);
  assert.equal(byKey.weightKg, 2);
});

test("a trend computes no delta, direction or rate of change", () => {
  // Comparing readings is the clinician's job. If a future change adds a
  // "rising"/"falling" field, this test is the one that should stop it.
  const series = vitalsTrend([
    at("2026-01-01T10:00:00Z", { bloodPressureSystolic: 120, bloodPressureDiastolic: 80 }),
    at("2026-02-01T10:00:00Z", { bloodPressureSystolic: 160, bloodPressureDiastolic: 100 }),
  ]);
  assert.deepEqual(Object.keys(series[0]).sort(), ["key", "label", "points"]);
  assert.deepEqual(Object.keys(series[0].points[0]).sort(), ["consultedAt", "value"]);
});

test("visits with no vitals contribute nothing rather than a gap of zeros", () => {
  const series = vitalsTrend([
    at("2026-01-01T10:00:00Z", { pulseBpm: 72 }),
    at("2026-02-01T10:00:00Z", {}),
    at("2026-03-01T10:00:00Z", { pulseBpm: 80 }),
  ]);
  assert.equal(series[0].points.length, 2);
});
