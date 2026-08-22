import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReportRange } from "./range";

const now = new Date("2026-08-20T12:00:00.000Z");

test("no params defaults to the last 30 days ending now", () => {
  const range = parseReportRange(null, null, now);
  assert.equal(range.to.toISOString(), now.toISOString());
  assert.equal(range.from.toISOString(), "2026-07-21T12:00:00.000Z");
});

test("explicit valid from/to are used as given (to at day start, exclusive)", () => {
  const range = parseReportRange("2026-08-01", "2026-08-15", now);
  assert.equal(range.from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-08-15T00:00:00.000Z");
});

test("from without to keeps the given from and defaults to to now", () => {
  const range = parseReportRange("2026-08-01", null, now);
  assert.equal(range.from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(range.to.toISOString(), now.toISOString());
});

test("an inverted range (from >= to) falls back to the default 30-day window", () => {
  const range = parseReportRange("2026-08-15", "2026-08-01", now);
  assert.equal(range.to.toISOString(), now.toISOString());
  assert.equal(range.from.toISOString(), "2026-07-21T12:00:00.000Z");
});

test("an unparsable date string falls back to the default 30-day window", () => {
  const range = parseReportRange("not-a-date", "2026-08-15", now);
  assert.equal(range.to.toISOString(), now.toISOString());
  assert.equal(range.from.toISOString(), "2026-07-21T12:00:00.000Z");
});
