import { test } from "node:test";
import assert from "node:assert/strict";
import { doctorOrderBy, parseDoctorSort, parseFacilitySort, usesVerifiedRanking } from "./sorting";
import { parseDiscoveryFilters, hasAnyDiscoveryFilter, buildDiscoveryFilterWhere } from "./filters";

test("an unknown or missing sort falls back to best match", () => {
  assert.equal(parseDoctorSort({}, false), "match");
  assert.equal(parseDoctorSort({ sort: "" }, false), "match");
  assert.equal(parseDoctorSort({ sort: "cheapest" }, false), "match");
});

test("explicit sorts are honoured", () => {
  assert.equal(parseDoctorSort({ sort: "fee" }, false), "fee");
  assert.equal(parseDoctorSort({ sort: "experience" }, false), "experience");
  assert.equal(parseDoctorSort({ sort: "soonest" }, false), "soonest");
});

// Sorting by distance with nothing to measure from would silently do
// nothing; falling back keeps the list in a defensible order.
test("distance without a location falls back to best match", () => {
  assert.equal(parseDoctorSort({ sort: "distance" }, false), "match");
  assert.equal(parseDoctorSort({ sort: "distance" }, true), "distance");
});

// This is what preserves the pre-existing behaviour: before there was a
// sort control, a location search WAS a distance sort.
test("best match with a location means nearest first", () => {
  assert.equal(parseDoctorSort({}, true), "distance");
  assert.equal(parseDoctorSort({ sort: "match" }, true), "distance");
});

test("an explicit non-distance sort survives having a location", () => {
  assert.equal(parseDoctorSort({ sort: "fee" }, true), "fee");
  assert.equal(parseDoctorSort({ sort: "soonest" }, true), "soonest");
});

test("only best match uses the verified-first ranking", () => {
  assert.equal(usesVerifiedRanking("match"), true);
  assert.equal(usesVerifiedRanking("fee"), false);
  assert.equal(usesVerifiedRanking("experience"), false);
  assert.equal(usesVerifiedRanking("soonest"), false);
  assert.equal(usesVerifiedRanking("distance"), false);
});

// A doctor with no published fee is unknown, not free — ordering them
// first would read as a claim about their price.
test("fee and experience sorts put unrecorded values last", () => {
  const fee = doctorOrderBy("fee");
  assert.deepEqual(fee?.[0], { consultationFeeMinor: { sort: "asc", nulls: "last" } });
  const experience = doctorOrderBy("experience");
  assert.deepEqual(experience?.[0], { experienceYears: { sort: "desc", nulls: "last" } });
});

test("sorts the database cannot express return no orderBy", () => {
  assert.equal(doctorOrderBy("match"), null);
  assert.equal(doctorOrderBy("distance"), null);
  assert.equal(doctorOrderBy("soonest"), null);
});

test("facility sorts follow the same location rules", () => {
  assert.equal(parseFacilitySort({}, false), "match");
  assert.equal(parseFacilitySort({}, true), "distance");
  assert.equal(parseFacilitySort({ sort: "doctors" }, true), "doctors");
  assert.equal(parseFacilitySort({ sort: "distance" }, false), "match");
});

test("filters parse leniently and clamp absurd values", () => {
  assert.deepEqual(parseDiscoveryFilters({}), {
    availableToday: false,
    maxFeeRupees: null,
    minExperienceYears: null,
  });
  assert.equal(parseDiscoveryFilters({ today: "1" }).availableToday, true);
  // What an unvalued HTML checkbox submits.
  assert.equal(parseDiscoveryFilters({ today: "on" }).availableToday, true);
  assert.equal(parseDiscoveryFilters({ maxFee: "500" }).maxFeeRupees, 500);
  assert.equal(parseDiscoveryFilters({ maxFee: "-5" }).maxFeeRupees, null);
  assert.equal(parseDiscoveryFilters({ maxFee: "abc" }).maxFeeRupees, null);
  assert.equal(parseDiscoveryFilters({ maxFee: "999999" }).maxFeeRupees, 5000);
  assert.equal(parseDiscoveryFilters({ minExp: "10" }).minExperienceYears, 10);
  assert.equal(parseDiscoveryFilters({ minExp: "0" }).minExperienceYears, null);
});

test("hasAnyDiscoveryFilter reports whether anything is narrowing the list", () => {
  assert.equal(hasAnyDiscoveryFilter(parseDiscoveryFilters({})), false);
  assert.equal(hasAnyDiscoveryFilter(parseDiscoveryFilters({ today: "1" })), true);
  assert.equal(hasAnyDiscoveryFilter(parseDiscoveryFilters({ maxFee: "500" })), true);
});

// The fee filter is expressed in paise because that is how the column
// stores it; getting this wrong by 100x is the obvious failure mode.
test("the fee ceiling converts rupees to the minor unit", () => {
  const where = buildDiscoveryFilterWhere(parseDiscoveryFilters({ maxFee: "500" }), new Date());
  assert.deepEqual(where.consultationFeeMinor, { lte: 50_000 });
});

test("an unfiltered request adds no clauses at all", () => {
  assert.deepEqual(buildDiscoveryFilterWhere(parseDiscoveryFilters({}), new Date()), {});
});

test("available today asks for a session that has not finished yet", () => {
  const now = new Date("2026-09-01T08:00:00.000Z");
  const where = buildDiscoveryFilterWhere(parseDiscoveryFilters({ today: "1" }), now);
  const some = where.sessions?.some as { status?: unknown; plannedEndAt?: { gte: Date } };
  assert.deepEqual(some.status, { in: ["SCHEDULED", "OPEN", "IN_PROGRESS"] });
  assert.equal(some.plannedEndAt?.gte, now);
});
