-- Vitals as measurements rather than prose.
--
-- These were always collected by the consultation form and flattened into
-- a string inside "clinicalAssessment". That captured the numbers and
-- destroyed them as data: nothing could chart a blood pressure across
-- visits because the reading was inside a paragraph.
--
-- All nullable. Real clinics do not measure everything at every visit, and
-- an unrecorded vital is a different fact from zero.
--
-- Existing records are deliberately NOT backfilled. Their vitals live in
-- free text written by a clinician, and parsing prose into structured
-- medical measurements would mean guessing at clinical data — a wrong
-- guess here is a wrong number in someone's medical record. Old records
-- keep their text exactly as written; new ones are structured.
ALTER TABLE "ConsultationRecord"
    ADD COLUMN "bloodPressureSystolic" INTEGER,
    ADD COLUMN "bloodPressureDiastolic" INTEGER,
    ADD COLUMN "pulseBpm" INTEGER,
    ADD COLUMN "temperatureF" DOUBLE PRECISION,
    ADD COLUMN "spo2Percent" INTEGER,
    ADD COLUMN "weightKg" DOUBLE PRECISION;
