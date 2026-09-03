import { before, test } from "node:test";
import assert from "node:assert/strict";
import { BASE_URL, prisma, requireServer } from "./helpers";

// The public proximity API. It is the one endpoint another client could be
// written against, so its contract is worth pinning down.

before(async () => {
  await requireServer();
});

interface NearbyResponse {
  origin: { latitude: number; longitude: number; source: string };
  matchedPlace: { label: string; kind: string } | null;
  radiusKm: number;
  doctors: { slug: string; name: string; distanceKm: number; distanceLabel: string; profileUrl: string }[];
  clinics: { slug: string; name: string; distanceKm: number; profileUrl: string }[];
}

async function nearby(query: string): Promise<{ status: number; body: NearbyResponse; headers: Headers }> {
  const response = await fetch(`${BASE_URL}/api/discovery/nearby?${query}`);
  return { status: response.status, body: (await response.json()) as NearbyResponse, headers: response.headers };
}

test("coordinates return nearest-first doctors with distances", async () => {
  const { status, body } = await nearby("lat=18.5372&lng=73.8949&radiusKm=5&kind=both");
  assert.equal(status, 200);
  assert.equal(body.radiusKm, 5);
  assert.equal(body.origin.source, "device");
  assert.ok(body.doctors.length > 0, "expected doctors near the seeded clinic");

  const distances = body.doctors.map((doctor) => doctor.distanceKm);
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b), "results must be nearest-first");
  for (const doctor of body.doctors) {
    assert.ok(doctor.distanceKm <= 5, `${doctor.name} is outside the requested radius`);
    assert.ok(doctor.distanceLabel.length > 0, "expected a human distance label");
    assert.equal(doctor.profileUrl, `/doctors/${doctor.slug}`);
  }
});

// The privacy rule: what the browser sends is already coarsened to ~100 m,
// and the echo proves the server used that and not something finer.
test("the origin is echoed back at ~100 m precision", async () => {
  const { body } = await nearby("lat=18.53627189&lng=73.89391234&radiusKm=5");
  assert.equal(body.origin.latitude, 18.536);
  assert.equal(body.origin.longitude, 73.894);
});

test("a location-derived response is never cached by a shared cache", async () => {
  const { headers } = await nearby("lat=18.5372&lng=73.8949");
  assert.equal(headers.get("cache-control"), "private, no-store");
});

test("a place name is resolved without an external geocoder", async () => {
  const { status, body } = await nearby("near=Pune&kind=both");
  assert.equal(status, 200);
  assert.equal(body.origin.source, "place");
  assert.ok(body.matchedPlace, "expected the place to resolve to an anchor");
});

test("an unknown place and a missing location are refused, with the radius limits", async () => {
  for (const query of ["near=NowhereAtAll", ""]) {
    const response = await fetch(`${BASE_URL}/api/discovery/nearby?${query}`);
    assert.equal(response.status, 400, `${query || "(no params)"} should be a 400`);
    const body = (await response.json()) as { error: string; radius: { maxKm: number } };
    assert.ok(body.error.length > 0);
    assert.ok(body.radius.maxKm > 0, "the error should say what a valid radius is");
  }
});

test("an absurd radius is clamped rather than rejected", async () => {
  const { status, body } = await nearby("lat=18.5372&lng=73.8949&radiusKm=99999");
  assert.equal(status, 200);
  assert.equal(body.radiusKm, 50, "should clamp to the documented maximum");
});

test("nothing is returned for a location with no listed facilities near it", async () => {
  const { status, body } = await nearby("lat=28.6139&lng=77.209&radiusKm=5&kind=both");
  assert.equal(status, 200);
  assert.equal(body.doctors.length, 0);
  assert.equal(body.clinics.length, 0);
});

// The API is a re-sorting of the public directory, never a way into it.
test("the API never exposes an unlisted facility or an internal id", async () => {
  const { body } = await nearby("lat=18.5372&lng=73.8949&radiusKm=50&kind=both");
  const unlisted = await prisma.clinic.findMany({
    where: { OR: [{ approvalStatus: { not: "APPROVED" } }, { isActive: false }] },
    select: { name: true, id: true },
  });
  const payload = JSON.stringify(body);

  for (const clinic of unlisted) {
    assert.ok(!payload.includes(clinic.name), `unlisted facility ${clinic.name} leaked`);
  }
  const anyDoctor = await prisma.doctor.findFirst({ select: { id: true } });
  if (anyDoctor) {
    assert.ok(!payload.includes(anyDoctor.id), "internal ids must never appear in a public payload");
  }
});

test("healthz reports the database is reachable", async () => {
  const response = await fetch(`${BASE_URL}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});
