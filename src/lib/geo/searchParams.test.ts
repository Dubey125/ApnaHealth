import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COORDINATE_PRECISION_DP,
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  coarsenCoordinates,
  parseLocationSearchParams,
} from "./searchParams";

test("coarsenCoordinates rounds to the documented precision", () => {
  const coarse = coarsenCoordinates({ latitude: 18.53627189, longitude: 73.89391234 });
  assert.equal(coarse.latitude, 18.536);
  assert.equal(coarse.longitude, 73.894);
  assert.equal(COORDINATE_PRECISION_DP, 3);
});

// The privacy rule, asserted rather than described: whatever the browser
// hands us, what leaves this function is ~100 m precision.
test("coarsenCoordinates discards street-level precision", () => {
  const precise = { latitude: 18.5362718, longitude: 73.8939123 };
  const coarse = coarsenCoordinates(precise);
  assert.notEqual(coarse.latitude, precise.latitude);
  assert.ok(Math.abs(coarse.latitude - precise.latitude) < 0.001);
});

test("a complete lat/lng pair parses into a coarse origin", () => {
  const parsed = parseLocationSearchParams({ lat: "18.5362718", lng: "73.8939123" });
  assert.deepEqual(parsed.origin, { latitude: 18.536, longitude: 73.894 });
  assert.equal(parsed.radiusKm, DEFAULT_RADIUS_KM);
});

// (0, 0) is a real point in the Gulf of Guinea, so an empty parameter must
// never coerce into one — a truncated URL would otherwise search there.
test("empty or half-supplied coordinates yield no origin, not (0, 0)", () => {
  assert.equal(parseLocationSearchParams({ lat: "", lng: "" }).origin, null);
  assert.equal(parseLocationSearchParams({ lat: "18.536" }).origin, null);
  assert.equal(parseLocationSearchParams({ lng: "73.894" }).origin, null);
  assert.equal(parseLocationSearchParams({}).origin, null);
});

test("out-of-range coordinates are rejected outright", () => {
  assert.equal(parseLocationSearchParams({ lat: "95", lng: "73.894" }).origin, null);
  assert.equal(parseLocationSearchParams({ lat: "18.536", lng: "200" }).origin, null);
  assert.equal(parseLocationSearchParams({ lat: "abc", lng: "73.894" }).origin, null);
});

test("radius is clamped rather than rejected, so a hand-edited URL still renders", () => {
  assert.equal(parseLocationSearchParams({ radiusKm: "500" }).radiusKm, MAX_RADIUS_KM);
  assert.equal(parseLocationSearchParams({ radiusKm: "0" }).radiusKm, MIN_RADIUS_KM);
  assert.equal(parseLocationSearchParams({ radiusKm: "-5" }).radiusKm, MIN_RADIUS_KM);
  assert.equal(parseLocationSearchParams({ radiusKm: "not-a-number" }).radiusKm, DEFAULT_RADIUS_KM);
  assert.equal(parseLocationSearchParams({ radiusKm: "" }).radiusKm, DEFAULT_RADIUS_KM);
  assert.equal(parseLocationSearchParams({ radiusKm: "10" }).radiusKm, 10);
});

test("a typed place is trimmed, length-capped and kept alongside the radius", () => {
  const parsed = parseLocationSearchParams({ near: "  Koregaon Park  ", radiusKm: "10" });
  assert.equal(parsed.near, "Koregaon Park");
  assert.equal(parsed.radiusKm, 10);
  assert.equal(parseLocationSearchParams({ near: "   " }).near, null);
  assert.equal(parseLocationSearchParams({ near: "x".repeat(500) }).near?.length, 120);
});
