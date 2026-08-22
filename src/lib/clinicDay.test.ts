import { test } from "node:test";
import assert from "node:assert/strict";
import { clinicDayBounds } from "./clinicDay";

test("midday UTC, comfortably inside the same IST calendar day", () => {
  const { start, end } = clinicDayBounds(new Date("2026-08-20T08:00:00.000Z"));
  assert.equal(start.toISOString(), "2026-08-19T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-08-20T18:30:00.000Z");
});

test("evening UTC that has already rolled into the next IST calendar day", () => {
  // 2026-08-20T19:00:00Z is 2026-08-21T00:30 IST.
  const { start, end } = clinicDayBounds(new Date("2026-08-20T19:00:00.000Z"));
  assert.equal(start.toISOString(), "2026-08-20T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-08-21T18:30:00.000Z");
});

test("exactly at the IST midnight boundary belongs to the new day (inclusive start)", () => {
  const { start, end } = clinicDayBounds(new Date("2026-08-20T18:30:00.000Z"));
  assert.equal(start.toISOString(), "2026-08-20T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-08-21T18:30:00.000Z");
});

test("one millisecond before the IST midnight boundary still belongs to the previous day", () => {
  const { start, end } = clinicDayBounds(new Date("2026-08-20T18:29:59.999Z"));
  assert.equal(start.toISOString(), "2026-08-19T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-08-20T18:30:00.000Z");
});
