import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLocationAnchors, normalizePlace, resolveLocationAnchor } from "./anchors";

const ROWS = [
  { areaLabel: "Koregaon Park", city: "Pune", postalCode: "411001", latitude: 18.536, longitude: 73.894 },
  { areaLabel: "Koregaon Park", city: "Pune", postalCode: "411001", latitude: 18.538, longitude: 73.896 },
  { areaLabel: "Deccan Gymkhana", city: "Pune", postalCode: "411004", latitude: 18.516, longitude: 73.841 },
  { areaLabel: "Bandra", city: "Mumbai", postalCode: "400050", latitude: 19.06, longitude: 72.83 },
  // Not geocoded: contributes nothing, and must not drag a centroid to 0/0.
  { areaLabel: "Hadapsar", city: "Pune", postalCode: "411028", latitude: null, longitude: null },
];

test("normalizePlace folds case, punctuation and spacing into one key", () => {
  assert.equal(normalizePlace("Koregaon-Park"), "koregaon park");
  assert.equal(normalizePlace("  KOREGAON   PARK "), "koregaon park");
  assert.equal(normalizePlace("Koregaon Park, Pune"), "koregaon park pune");
});

test("normalizePlace folds accents without splitting the word", () => {
  assert.equal(normalizePlace("Bandrá"), "bandra");
});

test("buildLocationAnchors averages the facilities in a locality", () => {
  const anchors = buildLocationAnchors(ROWS);
  const koregaon = anchors.find((anchor) => anchor.label === "Koregaon Park, Pune");
  assert.ok(koregaon);
  assert.equal(koregaon.facilityCount, 2);
  assert.equal(koregaon.latitude.toFixed(3), "18.537");
  assert.equal(koregaon.longitude.toFixed(3), "73.895");
});

// The un-geocoded row is the trap: including it would pull Pune's centroid
// a third of the way to the Gulf of Guinea.
test("buildLocationAnchors ignores facilities with no coordinates", () => {
  const anchors = buildLocationAnchors(ROWS);
  const pune = anchors.find((anchor) => anchor.kind === "CITY" && anchor.label === "Pune");
  assert.ok(pune);
  assert.equal(pune.facilityCount, 3);
  assert.ok(pune.latitude > 18 && pune.latitude < 19);
  assert.equal(
    anchors.some((anchor) => anchor.label.includes("Hadapsar")),
    false,
  );
});

test("an area is reachable by its bare name and by 'area, city'", () => {
  const anchors = buildLocationAnchors(ROWS);
  const bare = resolveLocationAnchor("koregaon park", anchors);
  const qualified = resolveLocationAnchor("Koregaon Park, Pune", anchors);
  assert.equal(bare?.label, "Koregaon Park, Pune");
  assert.equal(qualified?.label, "Koregaon Park, Pune");
});

test("a PIN code resolves to the tightest anchor available", () => {
  const anchors = buildLocationAnchors(ROWS);
  const anchor = resolveLocationAnchor("411004", anchors);
  assert.equal(anchor?.kind, "POSTAL_CODE");
  assert.equal(anchor?.label, "411004");
});

test("a city name resolves to the city, not to a locality inside it", () => {
  const anchors = buildLocationAnchors(ROWS);
  const anchor = resolveLocationAnchor("Pune", anchors);
  assert.equal(anchor?.kind, "CITY");
  assert.equal(anchor?.label, "Pune");
});

// The bug this prevents: falling back to substring matching too eagerly,
// so a complete, unambiguous city name resolves to some other place that
// merely contains it.
test("an exact match always beats a prefix or substring match", () => {
  const anchors = buildLocationAnchors([
    ...ROWS,
    { areaLabel: "Pune Camp", city: "Pune", postalCode: "411002", latitude: 18.51, longitude: 73.88 },
  ]);
  assert.equal(resolveLocationAnchor("Pune", anchors)?.label, "Pune");
});

test("a partial locality name still finds the locality", () => {
  const anchors = buildLocationAnchors(ROWS);
  assert.equal(resolveLocationAnchor("koreg", anchors)?.label, "Koregaon Park, Pune");
});

test("a place we have never listed resolves to nothing rather than to something wrong", () => {
  const anchors = buildLocationAnchors(ROWS);
  assert.equal(resolveLocationAnchor("Chennai", anchors), null);
  assert.equal(resolveLocationAnchor("   ", anchors), null);
});
