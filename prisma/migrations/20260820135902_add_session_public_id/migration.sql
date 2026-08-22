-- Add Session.publicId as nullable first so existing rows can be
-- backfilled (Prisma can't add a required column with no default when
-- rows already exist). Same pattern as 20260820125748_add_doctor_slug.
ALTER TABLE "Session" ADD COLUMN "publicId" TEXT;

-- Backfill: unique, deterministic placeholder derived from the row's own
-- id. Real seed data overwrites this with a fresh nanoid on the next
-- `prisma db seed` run (seed.ts recreates its rows from scratch).
UPDATE "Session" SET "publicId" = 'session-' || substr("id", 1, 16) WHERE "publicId" IS NULL;

ALTER TABLE "Session" ALTER COLUMN "publicId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Session_publicId_key" ON "Session"("publicId");
