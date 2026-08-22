-- CreateTable
CREATE TABLE "SessionBreak" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SessionBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionBreak_sessionId_startAt_idx" ON "SessionBreak"("sessionId", "startAt");

-- AddForeignKey
ALTER TABLE "SessionBreak" ADD CONSTRAINT "SessionBreak_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
