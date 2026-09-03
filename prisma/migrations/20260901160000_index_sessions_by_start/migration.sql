-- Discovery's "next available" queries filter a Session by clinicId or
-- doctorId, exclude finished ones on plannedEndAt, and order by
-- plannedStartAt. The existing single-column indexes served the filter but
-- left the ordering to a sort, on every discovery page load.
--
-- A btree answers any prefix of its columns, so these composites subsume
-- the single-column indexes they replace; keeping both would only add
-- write cost.
DROP INDEX IF EXISTS "Session_clinicId_idx";
DROP INDEX IF EXISTS "Session_doctorId_idx";

CREATE INDEX "Session_clinicId_plannedStartAt_idx" ON "Session"("clinicId", "plannedStartAt");
CREATE INDEX "Session_doctorId_plannedStartAt_idx" ON "Session"("doctorId", "plannedStartAt");
