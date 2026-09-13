-- Prescribed medicines as rows instead of a paragraph.
--
-- The consultation form always built structured rows (name, dose, timing,
-- duration, note) and flattened them into "prescriptionText" before
-- saving, exactly as vitals were flattened into "clinicalAssessment".
-- Nothing downstream could count how often a drug was prescribed, repeat a
-- prescription at follow-up, or lay one out properly when printed.
--
-- "prescriptionText" is KEPT and not dropped: records written before this
-- have their prescription there, and those are deliberately not parsed
-- into rows. Splitting a clinician's prescription prose back into drugs
-- and doses means guessing at a prescription, and a wrong guess is a wrong
-- drug in a medical record.
CREATE TABLE "PrescribedMedicine" (
    "id" TEXT NOT NULL,
    "consultationRecordId" TEXT NOT NULL,
    -- Order is part of a prescription: the primary drug is written first.
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT,
    "timing" TEXT,
    "duration" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrescribedMedicine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrescribedMedicine_consultationRecordId_position_idx"
    ON "PrescribedMedicine"("consultationRecordId", "position");

-- Cascade: a medicine line has no meaning without its consultation, unlike
-- the audit and record tables elsewhere in this schema which deliberately
-- restrict.
ALTER TABLE "PrescribedMedicine" ADD CONSTRAINT "PrescribedMedicine_consultationRecordId_fkey"
    FOREIGN KEY ("consultationRecordId") REFERENCES "ConsultationRecord"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
