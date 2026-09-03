-- Public slug for /facilities/[slug].
--
-- Added nullable, backfilled, then made NOT NULL + unique, because the
-- column has no sensible default: every existing facility needs a slug
-- derived from its own name and city.
ALTER TABLE "Clinic" ADD COLUMN "slug" TEXT;

-- Pass 1: slugify "<name> <city>" the same way src/lib/slugify.ts does —
-- lowercase, every run of non-alphanumerics collapsed to a single dash,
-- dashes trimmed from both ends. A name that slugifies to nothing (e.g.
-- Devanagari only) falls back to the row id, which is never empty.
UPDATE "Clinic"
SET "slug" = COALESCE(
  NULLIF(
    trim(BOTH '-' FROM regexp_replace(lower("name" || ' ' || "city"), '[^a-z0-9]+', '-', 'g')),
    ''
  ),
  'facility-' || "id"
);

-- Pass 2: two facilities can legitimately share a name AND a city, and the
-- unique index below would refuse the second one. Every duplicate after the
-- first (ordered by id, so the result is deterministic) gets its own id
-- appended — unique by construction, unlike a positional "-2" suffix, which
-- can itself collide with a facility whose real name ends in "2".
WITH duplicates AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "slug" ORDER BY "id") AS position
  FROM "Clinic"
)
UPDATE "Clinic" c
SET "slug" = c."slug" || '-' || c."id"
FROM duplicates d
WHERE c."id" = d."id" AND d.position > 1;

ALTER TABLE "Clinic" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");
