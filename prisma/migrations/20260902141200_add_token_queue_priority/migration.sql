-- Service order for a token, decoupled from its number.
--
-- 0 is normal FIFO order; a higher value is served earlier. Existing rows
-- default to 0, which reproduces exactly the ordering that was in force
-- before this migration (ORDER BY "tokenNumber" ASC), so no live queue
-- changes position when this is applied.
ALTER TABLE "Token" ADD COLUMN "queuePriority" INTEGER NOT NULL DEFAULT 0;
