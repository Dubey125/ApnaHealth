-- Facility coordinates for "search near you" discovery.
--
-- Both columns are nullable with no default and no backfill: there is no
-- honest value for a facility nobody has geocoded yet, and 0/0 is a real
-- point in the Gulf of Guinea that would rank first for anyone searching
-- from West Africa. Radius search skips rows where either column is NULL;
-- every other discovery filter continues to find them.
ALTER TABLE "Clinic" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Clinic" ADD COLUMN "longitude" DOUBLE PRECISION;

-- Supports the bounding-box pre-filter (latitude BETWEEN ... AND longitude
-- BETWEEN ...) that narrows candidates before the exact haversine distance
-- is computed in application code.
CREATE INDEX "Clinic_latitude_longitude_idx" ON "Clinic"("latitude", "longitude");
