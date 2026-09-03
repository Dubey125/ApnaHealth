import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoordinatePairFields } from "./formCoordinates";

test("both boxes blank means 'not recorded', not (0, 0)", () => {
  const result = parseCoordinatePairFields(null, null);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.coordinates, null);
});

test("whitespace-only boxes are treated as blank", () => {
  const result = parseCoordinatePairFields("   ", "\t");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.coordinates, null);
});

// The regression this exists for: half a pair, stored, puts a real clinic
// on the prime meridian and shows patients a distance of thousands of km.
test("half a pair is rejected rather than half-stored", () => {
  const latitudeOnly = parseCoordinatePairFields("18.5362", "");
  assert.equal(latitudeOnly.ok, false);
  assert.equal(!latitudeOnly.ok && latitudeOnly.error, "Enter both latitude and longitude, or leave both blank.");

  const longitudeOnly = parseCoordinatePairFields(null, "73.8939");
  assert.equal(longitudeOnly.ok, false);
});

test("a complete, valid pair parses at full precision", () => {
  const result = parseCoordinatePairFields("18.536271", "73.893912");
  assert.equal(result.ok, true);
  // Facility coordinates are a published property of a building, so unlike
  // a patient's position they are NOT coarsened.
  assert.deepEqual(result.ok && result.coordinates, { latitude: 18.536271, longitude: 73.893912 });
});

test("out-of-range and non-numeric values are rejected", () => {
  assert.equal(parseCoordinatePairFields("95", "73.89").ok, false);
  assert.equal(parseCoordinatePairFields("18.53", "181").ok, false);
  assert.equal(parseCoordinatePairFields("not-a-number", "73.89").ok, false);
});

test("zero is a legitimate coordinate when it was actually typed", () => {
  const result = parseCoordinatePairFields("0", "0");
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.coordinates, { latitude: 0, longitude: 0 });
});
