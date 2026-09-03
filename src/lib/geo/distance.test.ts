import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boundingBox,
  formatDistanceKm,
  haversineDistanceKm,
  isValidCoordinates,
  rankByDistance,
} from "./distance";

// Two real points about 5.6 km apart in Pune, used throughout: Koregaon
// Park and Deccan Gymkhana.
const KOREGAON_PARK = { latitude: 18.5362, longitude: 73.8939 };
const DECCAN = { latitude: 18.5158, longitude: 73.8408 };

test("haversineDistanceKm is zero for the same point", () => {
  assert.equal(haversineDistanceKm(KOREGAON_PARK, KOREGAON_PARK), 0);
});

test("haversineDistanceKm matches a known real-world distance", () => {
  const km = haversineDistanceKm(KOREGAON_PARK, DECCAN);
  assert.ok(km > 5.5 && km < 6.2, `expected ~5.9 km, got ${km}`);
});

test("haversineDistanceKm is symmetric", () => {
  assert.equal(
    haversineDistanceKm(KOREGAON_PARK, DECCAN).toFixed(9),
    haversineDistanceKm(DECCAN, KOREGAON_PARK).toFixed(9),
  );
});

test("one degree of latitude is about 111 km anywhere", () => {
  const km = haversineDistanceKm({ latitude: 18, longitude: 73 }, { latitude: 19, longitude: 73 });
  assert.ok(km > 110 && km < 112, `expected ~111 km, got ${km}`);
});

// The bounding box is a pre-filter in SQL; if it is ever narrower than the
// circle, real results vanish before haversine gets to see them. These
// tests exist for exactly that failure, which is silent in production.
test("boundingBox contains every point on the radius circle", () => {
  const radiusKm = 5;
  const box = boundingBox(KOREGAON_PARK, radiusKm);
  const [range] = box.longitudeRanges;

  for (let bearing = 0; bearing < 360; bearing += 5) {
    const radians = (bearing * Math.PI) / 180;
    // Displace by radiusKm along the bearing, using the same flat
    // approximation the box is built from, then verify containment.
    const latitude = KOREGAON_PARK.latitude + (radiusKm / 110.574) * Math.cos(radians);
    const longitude =
      KOREGAON_PARK.longitude +
      (radiusKm / (111.32 * Math.cos((KOREGAON_PARK.latitude * Math.PI) / 180))) * Math.sin(radians);

    assert.ok(latitude >= box.minLatitude && latitude <= box.maxLatitude, `latitude ${latitude} outside box`);
    assert.ok(longitude >= range.min && longitude <= range.max, `longitude ${longitude} outside box`);
  }
});

test("boundingBox widens in longitude as latitude increases", () => {
  const nearEquator = boundingBox({ latitude: 0, longitude: 0 }, 10);
  const farNorth = boundingBox({ latitude: 60, longitude: 0 }, 10);
  const width = (box: ReturnType<typeof boundingBox>) => box.longitudeRanges[0].max - box.longitudeRanges[0].min;
  assert.ok(width(farNorth) > width(nearEquator));
});

test("boundingBox degenerates to every longitude at the pole instead of dividing by zero", () => {
  const box = boundingBox({ latitude: 89.99, longitude: 20 }, 50);
  assert.deepEqual(box.longitudeRanges, [{ min: -180, max: 180 }]);
  assert.ok(box.maxLatitude <= 90);
});

test("boundingBox splits into two ranges across the antimeridian", () => {
  const box = boundingBox({ latitude: 0, longitude: 179.9 }, 50);
  assert.equal(box.longitudeRanges.length, 2);
  // Together they must still cover the eastern edge of the circle.
  assert.ok(box.longitudeRanges.some((range) => range.max === 180));
  assert.ok(box.longitudeRanges.some((range) => range.min === -180));
});

test("isValidCoordinates rejects NaN, nulls and out-of-range values", () => {
  assert.equal(isValidCoordinates(KOREGAON_PARK), true);
  assert.equal(isValidCoordinates(null), false);
  assert.equal(isValidCoordinates({ latitude: Number.NaN, longitude: 73 }), false);
  assert.equal(isValidCoordinates({ latitude: 91, longitude: 73 }), false);
  assert.equal(isValidCoordinates({ latitude: 18, longitude: 181 }), false);
});

test("rankByDistance orders nearest first and drops anything outside the radius", () => {
  const items = [
    { id: "far", latitude: 18.5158, longitude: 73.8408 },
    { id: "near", latitude: 18.5372, longitude: 73.8949 },
    { id: "outside", latitude: 19.076, longitude: 72.8777 },
  ];
  const ranked = rankByDistance(items, KOREGAON_PARK, 10, (item) => item);
  assert.deepEqual(
    ranked.map((entry) => entry.item.id),
    ["near", "far"],
  );
  assert.ok(ranked[0].distanceKm < ranked[1].distanceKm);
});

// The regression this guards: an un-geocoded facility whose NULL columns
// become 0/0 ranks as ~9,000 km from Pune, or — worse, if it were treated
// as the origin — first. It must simply not appear.
test("rankByDistance drops items with missing coordinates rather than defaulting them", () => {
  const items = [
    { id: "geocoded", latitude: 18.5372, longitude: 73.8949 },
    { id: "not-geocoded", latitude: null, longitude: null },
  ];
  const ranked = rankByDistance(items, KOREGAON_PARK, 10, (item) =>
    item.latitude === null || item.longitude === null
      ? null
      : { latitude: item.latitude, longitude: item.longitude },
  );
  assert.deepEqual(
    ranked.map((entry) => entry.item.id),
    ["geocoded"],
  );
});

test("formatDistanceKm never implies more precision than the data has", () => {
  assert.equal(formatDistanceKm(0.42), "400 m");
  assert.equal(formatDistanceKm(1.83), "1.8 km");
  assert.equal(formatDistanceKm(12.4), "12 km");
  // Below the ~100 m storage precision, "0 m away" would be a false claim.
  assert.equal(formatDistanceKm(0.001), "50 m");
  assert.equal(formatDistanceKm(Number.NaN), "—");
});
