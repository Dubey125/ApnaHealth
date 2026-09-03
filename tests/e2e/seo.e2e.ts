import { before, test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_URL,
  SITE_ORIGIN,
  canonicalHref,
  findJsonLd,
  getPage,
  jsonLdDocuments,
  metaContent,
  pageTitle,
  prisma,
  requireServer,
} from "./helpers";

// SEO and structured data. For a directory whose patients arrive by
// searching "paediatrician near Koregaon Park", these are load-bearing.

before(async () => {
  await requireServer();
});

test("robots.txt allows the directory and blocks the private areas", async () => {
  const page = await getPage("/robots.txt");
  assert.equal(page.status, 200);
  for (const blocked of ["/app/", "/admin/", "/patient/", "/t/", "/api/"]) {
    assert.ok(page.body.includes(`Disallow: ${blocked}`), `${blocked} should be disallowed`);
  }
  // /register is an acquisition page — "list my clinic online" is exactly
  // the search it should answer — and must NOT be blocked.
  assert.ok(!/Disallow: \/register/.test(page.body), "/register must stay crawlable");
  assert.ok(page.body.includes("Sitemap:"), "robots.txt should point at the sitemap");
});

test("the sitemap lists every listed doctor and facility, and nothing else", async () => {
  const page = await getPage("/sitemap.xml");
  assert.equal(page.status, 200);

  const [listedDoctors, listedFacilities, unlisted] = await Promise.all([
    prisma.doctor.findMany({
      where: { isActive: true, clinic: { isActive: true, approvalStatus: "APPROVED" } },
      select: { slug: true },
    }),
    prisma.clinic.findMany({
      where: { isActive: true, approvalStatus: "APPROVED", doctors: { some: { isActive: true } } },
      select: { slug: true },
    }),
    prisma.clinic.findMany({
      where: { OR: [{ approvalStatus: { not: "APPROVED" } }, { isActive: false }] },
      select: { slug: true },
    }),
  ]);

  for (const doctor of listedDoctors) {
    assert.ok(page.body.includes(`/doctors/${doctor.slug}`), `${doctor.slug} missing from sitemap`);
  }
  for (const facility of listedFacilities) {
    assert.ok(page.body.includes(`/facilities/${facility.slug}`), `${facility.slug} missing from sitemap`);
  }
  for (const facility of unlisted) {
    assert.ok(
      !page.body.includes(`/facilities/${facility.slug}`),
      `unlisted facility ${facility.slug} must never be advertised to a crawler`,
    );
  }
  assert.ok(page.body.includes("<lastmod>"), "entries should carry a real lastmod");
});

test("every public page has a distinct, non-duplicated title", async () => {
  const doctor = await prisma.doctor.findFirstOrThrow({
    where: { isActive: true, clinic: { isActive: true, approvalStatus: "APPROVED" } },
    select: { slug: true },
  });
  const titles = new Map<string, string>();
  for (const path of ["/", "/doctors", "/clinics", "/hospitals", `/doctors/${doctor.slug}`]) {
    const title = pageTitle((await getPage(path)).body);
    assert.ok(title && title.length > 0, `${path} should have a title`);
    // The brand appears once, from the root template — not twice, which is
    // what happened when pages carried their own suffix as well.
    const brandCount = (title.match(/ApnaHealth/g) ?? []).length;
    assert.equal(brandCount, 1, `${path} title repeats the brand: ${title}`);
    titles.set(path, title);
  }
  assert.equal(new Set(titles.values()).size, titles.size, "titles should be distinct across pages");
});

test("a filtered list canonicalises to the unfiltered page, but page 2 to itself", async () => {
  const filtered = await getPage("/doctors?specialty=Pediatrics");
  assert.equal(canonicalHref(filtered.body), `${SITE_ORIGIN}/doctors`, "a filter is a view, not a page");

  const second = await getPage("/doctors?page=2");
  assert.equal(canonicalHref(second.body), `${SITE_ORIGIN}/doctors?page=2`, "page 2 is its own content");
});

test("a doctor page emits valid Physician structured data pointing at its facility", async () => {
  const doctor = await prisma.doctor.findFirstOrThrow({
    where: { isActive: true, clinic: { isActive: true, approvalStatus: "APPROVED" } },
    include: { clinic: true },
  });
  const page = await getPage(`/doctors/${doctor.slug}`);

  const physician = findJsonLd(page.body, "Physician");
  assert.ok(physician, "expected Physician JSON-LD");
  assert.equal(physician.name, doctor.name);
  assert.equal(physician.medicalSpecialty, doctor.specialty);
  assert.equal(physician["@id"], `${SITE_ORIGIN}/doctors/${doctor.slug}`);

  const worksFor = physician.worksFor as Record<string, unknown> | undefined;
  assert.equal(worksFor?.["@id"], `${SITE_ORIGIN}/facilities/${doctor.clinic.slug}`);

  // Nothing may be asserted that the database does not know: no ratings,
  // no review counts, and verification is never dressed up as a credential.
  for (const forbidden of ["aggregateRating", "review", "award"]) {
    assert.equal(physician[forbidden], undefined, `must not claim ${forbidden}`);
  }

  assert.ok(findJsonLd(page.body, "BreadcrumbList"), "expected breadcrumbs");
});

test("a facility page is typed MedicalClinic or Hospital to match its own record", async () => {
  const clinic = await prisma.clinic.findFirstOrThrow({
    where: { isActive: true, approvalStatus: "APPROVED", doctors: { some: { isActive: true } } },
  });
  const page = await getPage(`/facilities/${clinic.slug}`);
  const expected = clinic.facilityType === "HOSPITAL" ? "Hospital" : "MedicalClinic";
  const facility = findJsonLd(page.body, expected);
  assert.ok(facility, `expected ${expected} JSON-LD`);
  assert.equal(facility.name, clinic.name);
  assert.equal(facility.telephone, clinic.phone);
});

test("every JSON-LD block is parseable and escapes any script-closing text", async () => {
  const doctor = await prisma.doctor.findFirstOrThrow({
    where: { isActive: true, clinic: { isActive: true, approvalStatus: "APPROVED" } },
    select: { slug: true },
  });
  for (const path of ["/", "/doctors", `/doctors/${doctor.slug}`]) {
    const page = await getPage(path);
    // jsonLdDocuments throws on malformed JSON, which is the assertion.
    const documents = jsonLdDocuments(page.body);
    assert.ok(documents.length > 0, `${path} should carry structured data`);
    for (const block of page.body.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.ok(!block[1].includes("</"), "an unescaped </ would close the script tag early");
    }
  }
});

test("social cards are generated per entity, not shared between them", async () => {
  const doctors = await prisma.doctor.findMany({
    where: { isActive: true, clinic: { isActive: true, approvalStatus: "APPROVED" } },
    select: { slug: true, name: true },
    take: 2,
  });
  if (doctors.length < 2) return;

  const images = await Promise.all(
    doctors.map(async (doctor) => {
      const response = await fetch(`${BASE_URL}/doctors/${doctor.slug}/opengraph-image`);
      assert.equal(response.status, 200, `${doctor.slug} should have a card`);
      assert.equal(response.headers.get("content-type"), "image/png");
      const bytes = new Uint8Array(await response.arrayBuffer());
      // PNG magic number.
      assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], "not a PNG");
      return Buffer.from(bytes).toString("base64");
    }),
  );

  // The regression this exists for: `params` is a Promise in Next 16, and
  // reading .slug off it gave undefined — which Prisma treats as "no
  // filter", so every doctor's URL returned the same arbitrary doctor's card.
  assert.notEqual(images[0], images[1], "two doctors must not share one social card");
});

test("each page names its own social card", async () => {
  const doctor = await prisma.doctor.findFirstOrThrow({
    where: { isActive: true, clinic: { isActive: true, approvalStatus: "APPROVED" } },
    select: { slug: true },
  });
  const page = await getPage(`/doctors/${doctor.slug}`);
  const image = metaContent(page.body, "og:image");
  assert.ok(image?.includes(`/doctors/${doctor.slug}/opengraph-image`), `unexpected og:image ${image}`);
});
