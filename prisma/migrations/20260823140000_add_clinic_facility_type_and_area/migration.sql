-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('CLINIC', 'HOSPITAL');

-- AlterTable
-- facilityType is NOT NULL with a default so existing rows are valid
-- without a backfill step: every facility recorded before this migration
-- was a clinic, which is exactly the default.
ALTER TABLE "Clinic" ADD COLUMN "facilityType" "FacilityType" NOT NULL DEFAULT 'CLINIC';

-- areaLabel is nullable: locality is genuinely unknown for existing rows,
-- and an empty string would be indistinguishable from "not recorded yet".
ALTER TABLE "Clinic" ADD COLUMN "areaLabel" TEXT;
