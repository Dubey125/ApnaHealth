-- Add Doctor.slug as nullable first so existing rows can be backfilled,
-- since Prisma can't add a required column with no default when rows
-- already exist (only 2 seed rows here, but the pattern is general).
ALTER TABLE "Doctor" ADD COLUMN "slug" TEXT;

-- Backfill: unique, deterministic placeholder derived from the row's own
-- id. Real seed data overwrites this with a human-readable slug on the
-- next `prisma db seed` run (seed.ts recreates its rows from scratch).
UPDATE "Doctor" SET "slug" = 'doctor-' || substr("id", 1, 12) WHERE "slug" IS NULL;

ALTER TABLE "Doctor" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_slug_key" ON "Doctor"("slug");
