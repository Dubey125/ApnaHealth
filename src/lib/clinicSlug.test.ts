import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClinicSlugBase, nextAvailableSlug, uniqueClinicSlug } from "./clinicSlug";

test("buildClinicSlugBase combines name and city into a URL-safe slug", () => {
  assert.equal(buildClinicSlugBase("Sunrise Multispeciality", "Pune"), "sunrise-multispeciality-pune");
});

test("buildClinicSlugBase collapses punctuation the way the SQL backfill does", () => {
  // The migration slugifies in SQL; if these two ever disagree, facilities
  // created before and after it get inconsistent URLs.
  assert.equal(buildClinicSlugBase("Dr. Roy's Pediatric Clinic", "New Delhi"), "dr-roy-s-pediatric-clinic-new-delhi");
  assert.equal(buildClinicSlugBase("  City   Hospital  ", "Mumbai"), "city-hospital-mumbai");
});

test("buildClinicSlugBase falls back rather than producing an empty URL", () => {
  assert.equal(buildClinicSlugBase("!!!", "???"), "facility");
});

test("nextAvailableSlug returns the base when nothing holds it", async () => {
  const slug = await nextAvailableSlug("city-hospital-mumbai", async () => false);
  assert.equal(slug, "city-hospital-mumbai");
});

// Two facilities can genuinely share a name AND a city, which is exactly
// the case a unique constraint would otherwise reject at signup.
test("nextAvailableSlug walks past every taken slug", async () => {
  const taken = new Set(["city-hospital-mumbai", "city-hospital-mumbai-2", "city-hospital-mumbai-3"]);
  const slug = await nextAvailableSlug("city-hospital-mumbai", async (candidate) => taken.has(candidate));
  assert.equal(slug, "city-hospital-mumbai-4");
});

test("uniqueClinicSlug builds the base and resolves the collision in one call", async () => {
  const taken = new Set(["sunrise-clinic-pune"]);
  const slug = await uniqueClinicSlug("Sunrise Clinic", "Pune", async (candidate) => taken.has(candidate));
  assert.equal(slug, "sunrise-clinic-pune-2");
});
