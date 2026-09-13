import { before, test } from "node:test";
import assert from "node:assert/strict";
import {
  countResultCards,
  getPage,
  getStatus,
  linkedSlugs,
  listedNames,
  prisma,
  requireServer,
} from "./helpers";
import { availableTodaySessionWhere } from "../../src/lib/discovery/filters";

// Discovery: the three lists, their filters, sorts, paging and location
// search. These codify the checks that were being run by hand after every
// change to this area.

before(async () => {
  await requireServer();
});

test("the three discovery routes all render", async () => {
  for (const path of ["/doctors", "/clinics", "/hospitals"]) {
    assert.equal(await getStatus(path), 200, `${path} should render`);
  }
});

test("the doctors list shows the seeded doctors", async () => {
  const page = await getPage("/doctors");
  assert.ok(countResultCards(page.body) >= 2, "expected at least the two seeded doctors");
  const slugs = linkedSlugs(page.body, "doctors");
  assert.ok(slugs.includes("dr-aditi-sharma"), `expected dr-aditi-sharma in ${slugs.join(", ")}`);
});

// The tabs are navigation links, not ARIA tabs — that was a real bug, and
// role="tab" promised a tabpanel that does not exist on a separate page.
test("the discovery tabs are a nav landmark, not a false ARIA tablist", async () => {
  const page = await getPage("/doctors");
  assert.ok(!page.body.includes('role="tablist"'), "role=tablist must not be used for cross-page links");
  assert.ok(!page.body.includes('role="tab"'), "role=tab must not be used for cross-page links");
  assert.ok(page.body.includes('aria-label="Search for"'), "the tab row should be a labelled nav");
});

test("a card's heading is the only link, so the card is not one giant anchor", async () => {
  const page = await getPage("/doctors");
  assert.ok(
    page.body.includes("after:absolute after:inset-0"),
    "cards should use the stretched-overlay pattern",
  );
  assert.ok(
    !page.body.includes('className="block h-full"'),
    "no card should be wrapped in a full-surface link",
  );
});

test("a doctor card links to the facility it practises at", async () => {
  const page = await getPage("/doctors");
  assert.ok(
    /href="\/facilities\/[a-z0-9-]+"/.test(page.body),
    "the facility link was impossible while the whole card was one anchor",
  );
});

test("filtering by specialty narrows the list", async () => {
  const all = await getPage("/doctors");
  const filtered = await getPage("/doctors?specialty=Pediatrics");
  assert.ok(countResultCards(filtered.body) > 0, "Pediatrics should match the seeded doctor");
  assert.ok(
    countResultCards(filtered.body) <= countResultCards(all.body),
    "a filter must never widen the list",
  );
});

test("a filter matching nothing shows an actionable empty state, not a dead end", async () => {
  const page = await getPage("/doctors?specialty=NoSuchSpecialityAtAll");
  assert.equal(countResultCards(page.body), 0);
  assert.ok(page.body.includes("border-dashed"), "expected the empty state");
  assert.ok(page.body.includes("Clear filters"), "the empty state must offer a way out");
});

test("an empty radius search offers to widen the radius, as a link", async () => {
  const page = await getPage("/doctors?lat=18.5372&lng=73.8949&radiusKm=2&specialty=NoSuchSpeciality");
  assert.equal(countResultCards(page.body), 0, "this search should find nothing");
  // Asserted on the href, not the label: React renders `Search {n} km
  // instead` as separate text nodes, and the link is the actual contract.
  assert.ok(
    /href="\/doctors\?[^"]*radiusKm=5[^"]*"/.test(page.body),
    "the widen-radius action must be a real link to the next radius up",
  );
  assert.ok(page.body.includes("Show everyone listed"), "expected a clear-location action");
});

test("radius search finds the seeded clinic and excludes somewhere far away", async () => {
  const near = await getPage("/doctors?lat=18.5372&lng=73.8949&radiusKm=5");
  const far = await getPage("/doctors?lat=28.6139&lng=77.209&radiusKm=5");
  assert.ok(countResultCards(near.body) > 0, "Pune coordinates should find the Pune clinic");
  assert.equal(countResultCards(far.body), 0, "Delhi coordinates should find nothing in Pune");
});

test("distances are shown once a location is active, and not before", async () => {
  const withLocation = await getPage("/doctors?lat=18.5372&lng=73.8949&radiusKm=5");
  const without = await getPage("/doctors");
  assert.ok(/\d+ m<!-- --> away|[\d.]+ km<!-- --> away/.test(withLocation.body), "expected a distance label");
  assert.ok(!/away<\/span>/.test(without.body), "no distances without a location");
});

test("a place name that matches nothing explains itself rather than erroring", async () => {
  const page = await getPage("/doctors?near=NowhereAtAll");
  assert.equal(page.status, 200);
  assert.ok(page.body.includes("aren&#x27;t sorted by distance"), "expected the unmatched-place notice");
});

// A non-distance sort with a location must still respect the radius:
// "cheapest near me", not "cheapest anywhere".
test("sorting by fee still honours an active radius", async () => {
  const near = await getPage("/doctors?lat=18.5372&lng=73.8949&radiusKm=5&sort=fee");
  const far = await getPage("/doctors?lat=28.6139&lng=77.209&radiusKm=5&sort=fee");
  assert.ok(countResultCards(near.body) > 0);
  assert.equal(countResultCards(far.body), 0, "the radius must survive a change of sort");
});

test("sorting by fee orders cheapest first and puts unpriced doctors last", async () => {
  const page = await getPage("/doctors?sort=fee");
  const names = listedNames(page.body);
  const doctors = await prisma.doctor.findMany({
    where: { name: { in: names } },
    select: { name: true, consultationFeeMinor: true },
  });
  const feeByName = new Map(doctors.map((doctor) => [doctor.name, doctor.consultationFeeMinor]));

  const fees = names.map((name) => feeByName.get(name) ?? null);
  const priced = fees.filter((fee): fee is number => fee !== null);
  const sortedPriced = [...priced].sort((a, b) => a - b);
  assert.deepEqual(priced, sortedPriced, "priced doctors should ascend by fee");

  const firstUnpriced = fees.indexOf(null);
  if (firstUnpriced !== -1) {
    assert.ok(
      fees.slice(firstUnpriced).every((fee) => fee === null),
      "doctors with no published fee must all come after those with one",
    );
  }
});

test("the sort control only offers 'nearest' when there is a location", async () => {
  const without = await getPage("/doctors");
  const withLocation = await getPage("/doctors?lat=18.5372&lng=73.8949");
  assert.ok(!without.body.includes("Nearest first"), "nothing to measure from, so no distance sort");
  assert.ok(withLocation.body.includes("Nearest first"));
  // "Best match" and "Nearest first" are the same thing once a location is
  // active, so only one is ever offered.
  assert.ok(!withLocation.body.includes(">Best match<"), "two controls doing the same thing");
});

test("available-today agrees with the database", async () => {
  const page = await getPage("/doctors?today=1");
  // Reuses the app's own clause rather than restating it: a test that
  // re-implements the rule only proves the two implementations agree with
  // each other, and drifts the moment one changes. (Restating it is how
  // this test failed first time round — it omitted the end-of-day bound
  // and counted tomorrow's sessions as today's.)
  const expected = await prisma.doctor.count({
    where: {
      isActive: true,
      clinic: { isActive: true, approvalStatus: "APPROVED" },
      sessions: { some: availableTodaySessionWhere(new Date()) },
    },
  });
  assert.equal(countResultCards(page.body), Math.min(expected, 12), "today filter should match the query");
});

test("changing a filter resets to page 1", async () => {
  const page = await getPage("/doctors?page=2&city=Pune");
  // Every chip link on the page must have dropped the page parameter.
  const chipHrefs = [...page.body.matchAll(/href="(\/doctors\?[^"]*specialty=[^"]*)"/g)].map((m) => m[1]);
  for (const href of chipHrefs) {
    assert.ok(!href.includes("page="), `filter link kept a stale page: ${href}`);
  }
});

test("paging keeps the filters that were applied", async () => {
  const page = await getPage("/clinics?specialty=General%20Medicine");
  const pageLinks = [...page.body.matchAll(/href="(\/clinics\?[^"]*page=\d+[^"]*)"/g)].map((m) => m[1]);
  for (const href of pageLinks) {
    assert.ok(href.includes("specialty="), `page link dropped the filter: ${href}`);
  }
});

test("a page beyond the end clamps instead of showing an empty list", async () => {
  const page = await getPage("/doctors?page=999");
  assert.equal(page.status, 200);
  assert.ok(countResultCards(page.body) > 0, "should clamp to the last page, not render nothing");
});

test("facility pages are reachable and name their doctors", async () => {
  const clinic = await prisma.clinic.findFirst({
    where: { isActive: true, approvalStatus: "APPROVED" },
    select: { slug: true },
  });
  assert.ok(clinic, "expected a listed facility in the seeded database");
  const page = await getPage(`/facilities/${clinic.slug}`);
  assert.equal(page.status, 200);
  assert.ok(/href="\/doctors\/[a-z0-9-]+"/.test(page.body), "a facility should link to its doctors");
});


test("a geocoded facility is reachable from the listing", async () => {
  // Was "map pins are real links" until the map was removed (3a948af).
  // The pin is gone; the thing it was really protecting — that a listed
  // facility can actually be opened from the list — is not.
  const page = await getPage("/clinics");
  const clinic = await prisma.clinic.findFirst({
    where: { isActive: true, approvalStatus: "APPROVED", latitude: { not: null } },
    select: { slug: true },
  });
  if (!clinic) return;
  assert.ok(page.body.includes(`href="/facilities/${clinic.slug}"`), "a listed facility should be a link");
});

