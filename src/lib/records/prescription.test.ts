import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MEDICINES,
  displayMedicine,
  parseMedicines,
  withPositions,
} from "./prescription";

const json = (value: unknown) => JSON.stringify(value);

// --- Parsing untrusted input ---

test("an empty or absent field is an empty prescription, not an error", () => {
  // Plenty of consultations prescribe nothing.
  for (const raw of [null, "", "   "]) {
    const result = parseMedicines(raw);
    assert.ok(result.ok);
    assert.deepEqual(result.medicines, []);
  }
});

test("a valid list parses with its optional parts", () => {
  const result = parseMedicines(
    json([{ name: "Amoxicillin", dosage: "1-0-1", timing: "After food", duration: "5 days", notes: "Finish course" }]),
  );
  assert.ok(result.ok);
  assert.equal(result.medicines.length, 1);
  assert.equal(result.medicines[0].name, "Amoxicillin");
  assert.equal(result.medicines[0].duration, "5 days");
});

test("only the name is required — an incomplete row still saves", () => {
  // Refusing would push the prescriber back into free text, which is the
  // format this replaces.
  const result = parseMedicines(json([{ name: "Paracetamol" }]));
  assert.ok(result.ok);
  assert.equal(result.medicines[0].name, "Paracetamol");
  assert.equal(result.medicines[0].dosage, undefined);
});

test("rows with no medicine name are dropped, not rejected", () => {
  // The form starts with one empty row, so a half-filled trailing row is
  // the normal shape of a finished form.
  const result = parseMedicines(json([{ name: "Metformin" }, { name: "" }, { name: "   " }, { dosage: "1-0-1" }]));
  assert.ok(result.ok);
  assert.deepEqual(result.medicines.map((m) => m.name), ["Metformin"]);
});

test("an empty optional field stores as unset, not as an empty string", () => {
  const result = parseMedicines(json([{ name: "Aspirin", dosage: "  ", notes: "" }]));
  assert.ok(result.ok);
  assert.equal(result.medicines[0].dosage, undefined);
  assert.equal(result.medicines[0].notes, undefined);
});

// --- Hostile and malformed input ---

test("malformed JSON is refused with a message a prescriber can act on", () => {
  const result = parseMedicines("{not json");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /re-enter the medicines/i);
});

test("a non-array payload is refused", () => {
  for (const raw of [json({ name: "Amoxicillin" }), json("Amoxicillin"), json(42), json(null)]) {
    assert.equal(parseMedicines(raw).ok, false, `should refuse ${raw}`);
  }
});

test("a payload of thousands of rows cannot be inserted against one consultation", () => {
  // Not a clinical limit — no view is taken on how many medicines a
  // patient should be on. It bounds what one submission can create.
  const huge = Array.from({ length: MAX_MEDICINES + 1 }, (_, i) => ({ name: `Drug ${i}` }));
  assert.equal(parseMedicines(json(huge)).ok, false);
  const atLimit = Array.from({ length: MAX_MEDICINES }, (_, i) => ({ name: `Drug ${i}` }));
  assert.equal(parseMedicines(json(atLimit)).ok, true);
});

test("junk inside a row does not crash the parse", () => {
  const result = parseMedicines(json([null, 42, "text", { name: "Ibuprofen" }]));
  assert.ok(result.ok);
  assert.deepEqual(result.medicines.map((m) => m.name), ["Ibuprofen"]);
});

test("an over-long field is refused rather than silently truncated", () => {
  // Truncating a prescription would change what the doctor wrote.
  const result = parseMedicines(json([{ name: "A".repeat(500) }]));
  assert.equal(result.ok, false);
});

// --- Order ---

test("medicines keep the order the prescriber listed them in", () => {
  // A doctor writes the primary drug first; that is part of the
  // prescription, not an accident of row order.
  const rows = withPositions([{ name: "First" }, { name: "Second" }, { name: "Third" }]);
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);
  assert.equal(rows[0].name, "First");
});

// --- Display ---

test("absent parts are omitted, never rendered as a placeholder", () => {
  // "Dose: —" invites being read as a dose that was considered and left
  // blank, when it simply was not recorded.
  const display = displayMedicine({ name: "Paracetamol", dosage: null, timing: null, duration: null, notes: null });
  assert.equal(display.instructions, "");
  assert.ok(!display.instructions.includes("—"));
});

test("dose, timing and duration join into one readable line", () => {
  const display = displayMedicine({
    name: "Amoxicillin", dosage: "1-0-1", timing: "After food", duration: "5 days", notes: null,
  });
  assert.equal(display.instructions, "1-0-1 · After food · 5 days");
});

test("a partial instruction line omits only the missing part", () => {
  const display = displayMedicine({
    name: "Metformin", dosage: "1-0-1", timing: null, duration: "30 days", notes: null,
  });
  assert.equal(display.instructions, "1-0-1 · 30 days");
});


// --- The boundary ---

test("nothing here checks a medicine against anything", () => {
  // Allergies and medicines are both structured now and sit on the same
  // screen. Comparing them is clinical decision support and needs its own
  // approval — not to be quietly enabled because the data lines up.
  const surface = { parseMedicines, withPositions, displayMedicine };
  for (const name of Object.keys(surface)) {
    assert.ok(
      !/interact|allerg|contraind|warn|alert|check|validate.*dose/i.test(name),
      `${name} suggests decision support`,
    );
  }
});
