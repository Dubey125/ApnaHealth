import { test } from "node:test";
import assert from "node:assert/strict";
import type { AllergySeverity } from "@/generated/prisma/enums";
import {
  activeAllergies,
  allergyInputSchema,
  allergyStatus,
  allergySummary,
  isDuplicateSubstance,
  orderedAllergies,
  type AllergyRecord,
} from "./allergies";

let counter = 0;
const allergy = (overrides: Partial<AllergyRecord> = {}): AllergyRecord => ({
  id: `a${++counter}`,
  substance: "Penicillin",
  reaction: null,
  severity: "UNKNOWN" as AllergySeverity,
  recordedAt: new Date("2026-01-01T10:00:00Z"),
  retractedAt: null,
  ...overrides,
});

// --- The distinction this module exists for ---

test("an empty list with no review says NOT ASKED, never 'none'", () => {
  // The failure this prevents: a doctor glances at a blank allergy panel,
  // reads it as "cleared", and prescribes.
  assert.equal(allergyStatus([], null), "NOT_ASKED");
  assert.equal(allergySummary([], null), "Allergies not recorded");
});

test("an empty list WITH a review is a real negative finding", () => {
  const reviewed = new Date("2026-02-01T10:00:00Z");
  assert.equal(allergyStatus([], reviewed), "NONE_KNOWN");
  assert.equal(allergySummary([], reviewed), "No known allergies");
});

test("the two empty states are never the same string", () => {
  assert.notEqual(allergySummary([], null), allergySummary([], new Date()));
});

test("a summary is never blank, in any state", () => {
  // A blank where an allergy summary belongs reads as "none".
  for (const [list, reviewed] of [
    [[], null],
    [[], new Date()],
    [[allergy()], new Date()],
    [[allergy({ retractedAt: new Date() })], null],
  ] as const) {
    assert.ok(allergySummary([...list], reviewed).length > 0);
  }
});

// --- Retraction ---

test("a retracted allergy is history, not a warning", () => {
  const list = [allergy({ retractedAt: new Date("2026-03-01T10:00:00Z") })];
  assert.equal(activeAllergies(list).length, 0);
  assert.equal(orderedAllergies(list).length, 0);
});

test("retracting the only allergy does not silently become 'no known allergies' unless someone reviewed", () => {
  const list = [allergy({ retractedAt: new Date() })];
  assert.equal(allergyStatus(list, null), "NOT_ASKED", "a withdrawal is not a negative finding");
  assert.equal(allergyStatus(list, new Date()), "NONE_KNOWN");
});

test("one retracted and one active allergy still reads as KNOWN", () => {
  const list = [allergy({ retractedAt: new Date() }), allergy({ substance: "Sulfa" })];
  assert.equal(allergyStatus(list, null), "KNOWN");
  assert.equal(allergySummary(list, null), "Sulfa");
});

// --- Ordering ---

test("the clinician's own SEVERE is shown first", () => {
  const list = [
    allergy({ substance: "Dust", severity: "MILD" }),
    allergy({ substance: "Penicillin", severity: "SEVERE" }),
    allergy({ substance: "Latex", severity: "MODERATE" }),
    allergy({ substance: "Pollen", severity: "UNKNOWN" }),
  ];
  assert.deepEqual(
    orderedAllergies(list).map((a) => a.substance),
    ["Penicillin", "Latex", "Dust", "Pollen"],
  );
});

test("equal severity falls back to most recently recorded", () => {
  const list = [
    allergy({ substance: "Older", severity: "MILD", recordedAt: new Date("2026-01-01T00:00:00Z") }),
    allergy({ substance: "Newer", severity: "MILD", recordedAt: new Date("2026-06-01T00:00:00Z") }),
  ];
  assert.deepEqual(orderedAllergies(list).map((a) => a.substance), ["Newer", "Older"]);
});

test("ordering never invents or changes a severity", () => {
  // Ordering by the clinician's recorded severity is presenting their own
  // record back to them. Deriving one from the substance would not be.
  const list = [allergy({ substance: "Penicillin", severity: "UNKNOWN" })];
  assert.equal(orderedAllergies(list)[0].severity, "UNKNOWN", "a known-dangerous drug is still UNKNOWN if unrecorded");
});

// --- Input ---

test("a substance is required, a reaction is not", () => {
  // A clinician who knows the substance but not the reaction must still be
  // able to record the substance. Requiring both would record neither.
  assert.equal(allergyInputSchema.safeParse({ substance: "" }).success, false);
  assert.equal(allergyInputSchema.safeParse({ substance: "P" }).success, false, "one letter is not a substance");
  assert.ok(allergyInputSchema.safeParse({ substance: "Penicillin" }).success);
});

test("severity defaults to UNKNOWN rather than manufacturing certainty", () => {
  const parsed = allergyInputSchema.safeParse({ substance: "Penicillin" });
  assert.ok(parsed.success);
  assert.equal(parsed.data.severity, "UNKNOWN");
});

test("an empty reaction stores as unset, not as an empty string", () => {
  const parsed = allergyInputSchema.safeParse({ substance: "Latex", reaction: "   " });
  assert.ok(parsed.success);
  assert.equal(parsed.data.reaction, undefined);
});

// --- Duplicates ---

test("the same substance in different case is a duplicate", () => {
  const existing = [allergy({ substance: "Penicillin" })];
  assert.equal(isDuplicateSubstance("penicillin ", existing), true);
  assert.equal(isDuplicateSubstance("  PENICILLIN", existing), true);
  assert.equal(isDuplicateSubstance("Sulfa", existing), false);
});

test("a retracted allergy does not block recording it again", () => {
  // A patient can be found to have an allergy that was previously
  // withdrawn, and the clinician must not be stopped from saying so.
  const existing = [allergy({ substance: "Penicillin", retractedAt: new Date() })];
  assert.equal(isDuplicateSubstance("Penicillin", existing), false);
});

// --- The boundary ---

test("nothing here compares an allergy to a prescription", () => {
  // If interaction checking is ever added, it must be a deliberate,
  // separately approved decision — not something that creeps into this
  // module. The public surface is the guard: no function takes a drug or
  // a prescription as an argument.
  const exported = { activeAllergies, allergyStatus, allergySummary, orderedAllergies, isDuplicateSubstance };
  for (const [name, fn] of Object.entries(exported)) {
    assert.ok(!/prescri|interact|contraind|check|warn|alert/i.test(name), `${name} suggests decision support`);
    assert.ok(typeof fn === "function");
  }
});
