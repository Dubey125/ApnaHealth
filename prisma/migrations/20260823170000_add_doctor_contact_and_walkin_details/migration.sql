-- AlterTable
-- Public contact details for a doctor's own profile, separate from the
-- clinic switchboard. Both nullable: existing doctors have neither
-- recorded, and an empty string would be indistinguishable from "not
-- provided".
ALTER TABLE "Doctor" ADD COLUMN "phone" TEXT;
ALTER TABLE "Doctor" ADD COLUMN "email" TEXT;

-- AlterTable
-- Walk-in / offline booking details captured at the counter, where there
-- is no Patient account to read these from. Nullable throughout: tokens
-- issued before this migration genuinely did not record them, and
-- self-booked tokens may still omit them.
ALTER TABLE "Token" ADD COLUMN "patientAgeSnapshot" INTEGER;
ALTER TABLE "Token" ADD COLUMN "patientSexSnapshot" TEXT;
ALTER TABLE "Token" ADD COLUMN "reasonForVisit" TEXT;
