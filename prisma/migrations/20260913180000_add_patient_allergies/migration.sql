-- Patient allergies.
--
-- There was previously nowhere to record that a patient reacts badly to a
-- substance, while the prescription box sat on the same screen.
--
-- "allergiesReviewedAt" exists because "no known allergies" and "nobody
-- has asked" look identical in an empty list and are completely different
-- clinical facts. Without it, a blank allergy panel reads as "cleared"
-- when it may mean nothing of the sort.
--
-- Nothing is backfilled: every existing patient starts as NOT ASKED, which
-- is the truth. Marking them reviewed would assert a negative finding
-- nobody made.

CREATE TYPE "AllergySeverity" AS ENUM ('UNKNOWN', 'MILD', 'MODERATE', 'SEVERE');

ALTER TABLE "Patient"
    ADD COLUMN "allergiesReviewedAt" TIMESTAMPTZ(3),
    ADD COLUMN "allergiesReviewedByDoctorId" TEXT;

ALTER TABLE "Patient" ADD CONSTRAINT "Patient_allergiesReviewedByDoctorId_fkey"
    FOREIGN KEY ("allergiesReviewedByDoctorId") REFERENCES "Doctor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PatientAllergy" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "doctorId" TEXT,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity" NOT NULL DEFAULT 'UNKNOWN',
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    -- Never hard-deleted. A withdrawn allergy is retracted and stays in the
    -- record: "recorded and later withdrawn" is itself clinically
    -- meaningful, and removing it would leave a doctor wondering whether it
    -- was ever there.
    "retractedAt" TIMESTAMPTZ(3),
    "retractedReason" TEXT,
    "retractedByDoctorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PatientAllergy_pkey" PRIMARY KEY ("id")
);

-- The consultation screen reads active allergies for one patient on every
-- load, so that is the query this serves.
CREATE INDEX "PatientAllergy_patientId_retractedAt_idx"
    ON "PatientAllergy"("patientId", "retractedAt");

ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_retractedByDoctorId_fkey"
    FOREIGN KEY ("retractedByDoctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
