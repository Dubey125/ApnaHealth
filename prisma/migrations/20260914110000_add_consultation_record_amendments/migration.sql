-- Corrections to a consultation record.
--
-- Records were create-once and permanent: a doctor who typed the wrong
-- diagnosis was stuck with it forever.
--
-- NEVER OVERWRITE, ALWAYS APPEND. The original ConsultationRecord row is
-- never altered and never deleted. An amendment is a new, separately
-- attributed statement alongside it, and both stay readable — a medical
-- record is evidence of what a clinician believed at the time, and a
-- correction that could quietly replace the original would destroy that.
--
-- Append-only in the same sense as QueueEvent and RecordAccessEvent: rows
-- are inserted, never updated or deleted. RESTRICT rather than CASCADE on
-- the record, so a correction cannot be removed by deleting what it
-- corrects.
CREATE TABLE "ConsultationRecordAmendment" (
    "id" TEXT NOT NULL,
    "consultationRecordId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "amendedAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "chiefComplaint" TEXT,
    "clinicalAssessment" TEXT,
    "diagnosisText" TEXT,
    "followUpInstructions" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsultationRecordAmendment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultationRecordAmendment_consultationRecordId_amendedAt_idx"
    ON "ConsultationRecordAmendment"("consultationRecordId", "amendedAt");

ALTER TABLE "ConsultationRecordAmendment" ADD CONSTRAINT "ConsultationRecordAmendment_consultationRecordId_fkey"
    FOREIGN KEY ("consultationRecordId") REFERENCES "ConsultationRecord"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsultationRecordAmendment" ADD CONSTRAINT "ConsultationRecordAmendment_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
