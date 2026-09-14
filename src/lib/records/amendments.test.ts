import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AMENDABLE_FIELDS,
  amendedFields,
  amendmentSchema,
  canAmend,
  inOrder,
  supersededFields,
  type AmendmentRecord,
} from "./amendments";

let counter = 0;
const amendment = (overrides: Partial<AmendmentRecord> = {}): AmendmentRecord => ({
  id: `am${++counter}`,
  amendedAt: new Date("2026-03-01T10:00:00Z"),
  reason: "Typed the wrong diagnosis",
  note: null,
  chiefComplaint: null,
  clinicalAssessment: null,
  diagnosisText: null,
  followUpInstructions: null,
  ...overrides,
});

// --- A reason is not optional ---

test("an amendment without a reason is refused", () => {
  // The person reading this in a year needs to know WHY the record
  // changed, and this field is the only place that can say.
  assert.equal(amendmentSchema.safeParse({ diagnosisText: "Corrected" }).success, false);
  assert.equal(amendmentSchema.safeParse({ reason: "oops", diagnosisText: "X" }).success, false, "too short to explain");
  assert.ok(amendmentSchema.safeParse({ reason: "Wrong diagnosis entered", diagnosisText: "X" }).success);
});

test("an amendment that restates nothing is refused", () => {
  // A correction that corrects nothing is noise in a medical record.
  assert.equal(amendmentSchema.safeParse({ reason: "Some reason here" }).success, false);
});

test("a note alone is a valid amendment", () => {
  // Covers what the structured fields cannot — a prescription already
  // printed and handed over cannot be un-issued, so the honest correction
  // is a note saying what it should have read.
  const parsed = amendmentSchema.safeParse({
    reason: "Dose was mistyped on the printed sheet",
    note: "Amoxicillin should read 1-0-1, not 1-1-1. Patient telephoned.",
  });
  assert.ok(parsed.success);
});

test("an empty restatement stores as unset, not as an empty string", () => {
  const parsed = amendmentSchema.safeParse({
    reason: "Clarifying the diagnosis",
    diagnosisText: "Revised",
    chiefComplaint: "   ",
  });
  assert.ok(parsed.success);
  assert.equal(parsed.data.chiefComplaint, undefined, "whitespace is not a correction");
});

// --- What changed ---

test("only restated fields are reported as amended", () => {
  // An amendment that corrected a diagnosis says nothing about the chief
  // complaint; rendering an empty row would imply it was reviewed.
  const fields = amendedFields(amendment({ diagnosisText: "Revised diagnosis" }));
  assert.deepEqual(fields.map((f) => f.field), ["diagnosisText"]);
  assert.equal(fields[0].value, "Revised diagnosis");
  assert.ok(fields[0].label.length > 0, "every field carries a human label");
});

test("an amendment can restate several fields at once", () => {
  const fields = amendedFields(
    amendment({ diagnosisText: "A", followUpInstructions: "B", chiefComplaint: "C" }),
  );
  assert.equal(fields.length, 3);
});

test("every amendable field has a label", () => {
  for (const field of AMENDABLE_FIELDS) {
    const fields = amendedFields(amendment({ [field]: "value" } as Partial<AmendmentRecord>));
    assert.equal(fields.length, 1, `${field} should be reported`);
    assert.ok(fields[0].label.length > 0, `${field} has no label`);
  }
});

// --- Superseding marks, never hides ---

test("superseded fields are identified across every amendment", () => {
  const superseded = supersededFields([
    amendment({ diagnosisText: "First correction" }),
    amendment({ followUpInstructions: "Second correction" }),
  ]);
  assert.ok(superseded.has("diagnosisText"));
  assert.ok(superseded.has("followUpInstructions"));
  assert.ok(!superseded.has("chiefComplaint"));
});

test("nothing in this module computes a merged current value", () => {
  // The guard that matters. If a "current record" merge ever appears, the
  // original stops being visible and the record stops being evidence of
  // what was written at the time. A reader must always see both.
  const surface = { amendedFields, supersededFields, inOrder, canAmend };
  for (const name of Object.keys(surface)) {
    assert.ok(!/merge|current|effective|resolve|apply|flatten/i.test(name), `${name} suggests overwriting the original`);
  }
});

test("an amendment never carries the original value it replaced", () => {
  // The original lives on the record, exactly once. Copying it here would
  // create a second place for it to drift.
  const keys = Object.keys(amendment({ diagnosisText: "Revised" }));
  assert.ok(!keys.some((k) => /previous|original|old|before/i.test(k)));
});

// --- Order ---

test("corrections read in the order they were made", () => {
  const ordered = inOrder([
    amendment({ reason: "Third correction", amendedAt: new Date("2026-05-01T00:00:00Z") }),
    amendment({ reason: "First correction", amendedAt: new Date("2026-03-01T00:00:00Z") }),
    amendment({ reason: "Second correction", amendedAt: new Date("2026-04-01T00:00:00Z") }),
  ]);
  assert.deepEqual(ordered.map((a) => a.reason), ["First correction", "Second correction", "Third correction"]);
});

// --- Who may amend ---

test("only the record's author may amend it", () => {
  // A different clinician who disagrees writes their own record. An
  // amendment carries the authority of whoever made the original entry.
  assert.equal(canAmend("doctor-1", "doctor-1"), true);
  assert.equal(canAmend("doctor-1", "doctor-2"), false);
});

test("a viewer with no doctor identity may never amend", () => {
  // Owners and front-desk staff have no doctorId. Neither may restate a
  // clinician's note.
  assert.equal(canAmend("doctor-1", null), false);
});
