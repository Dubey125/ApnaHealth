-- What kind of visit a token is for, so the prediction engine can keep a
-- separate service-time distribution per type.
--
-- Existing rows keep UNSPECIFIED rather than being backfilled to NEW.
-- Nobody recorded a type for them, and guessing one would mix follow-ups
-- into the NEW distribution — which is precisely the error this column
-- exists to remove.
CREATE TYPE "VisitType" AS ENUM ('UNSPECIFIED', 'NEW', 'FOLLOW_UP', 'PROCEDURE');

ALTER TABLE "Token" ADD COLUMN "visitType" "VisitType" NOT NULL DEFAULT 'UNSPECIFIED';
