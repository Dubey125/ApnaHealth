import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChipHref, buildHrefWithout, firstValue, emptyToUndefined } from "./searchParams";

test("firstValue takes the first of a repeated parameter", () => {
  assert.equal(firstValue("pune"), "pune");
  assert.equal(firstValue(["pune", "mumbai"]), "pune");
  assert.equal(firstValue(undefined), undefined);
});

test("emptyToUndefined treats blank input as absent", () => {
  assert.equal(emptyToUndefined("  pune "), "pune");
  assert.equal(emptyToUndefined("   "), undefined);
  assert.equal(emptyToUndefined(""), undefined);
});

test("buildChipHref toggles one parameter and preserves the rest", () => {
  const href = buildChipHref("/doctors", { city: "Pune", specialty: "Cardiology" }, "specialty", "Pediatrics");
  assert.ok(href.startsWith("/doctors?"));
  const params = new URLSearchParams(href.split("?")[1]);
  assert.equal(params.get("city"), "Pune");
  assert.equal(params.get("specialty"), "Pediatrics");
});

test("buildChipHref with a null value clears that parameter", () => {
  const href = buildChipHref("/doctors", { specialty: "Cardiology" }, "specialty", null);
  assert.equal(href, "/doctors");
});

// The regression this guards: toggling a filter while deep in a list left
// ?page=4 in the URL, so narrowing to a speciality with one page of results
// landed on an empty page 4 rather than the results just asked for.
test("changing any filter drops the page number", () => {
  const href = buildChipHref("/doctors", { page: "4", city: "Pune" }, "specialty", "Cardiology");
  const params = new URLSearchParams(href.split("?")[1]);
  assert.equal(params.get("page"), null);
  assert.equal(params.get("city"), "Pune");
});

test("paging itself keeps the page parameter", () => {
  const href = buildChipHref("/doctors", { page: "4", city: "Pune" }, "page", "5");
  const params = new URLSearchParams(href.split("?")[1]);
  assert.equal(params.get("page"), "5");
  assert.equal(params.get("city"), "Pune");
});

test("buildHrefWithout strips every named parameter", () => {
  const href = buildHrefWithout(
    "/doctors",
    { lat: "18.5", lng: "73.8", radiusKm: "5", specialty: "Cardiology" },
    ["lat", "lng", "radiusKm"],
  );
  assert.equal(href, "/doctors?specialty=Cardiology");
});
