-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('PATIENT', 'STAFF', 'ADMIN');

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminEvent" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AdminEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "requestedIp" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE INDEX "AdminEvent_occurredAt_idx" ON "AdminEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_kind_accountId_idx" ON "PasswordResetToken"("kind", "accountId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
                     ADD COLUMN "approvalDecidedAt" TIMESTAMPTZ(3),
                     ADD COLUMN "approvalNotes" TEXT,
                     ADD COLUMN "reviewedByAdminId" TEXT;

-- Backfill. The column default is PENDING because that is what a public
-- self-signup must be, but every Clinic that exists at the moment this
-- migration runs was created by prisma/seed.ts or by direct database
-- access -- i.e. already trusted. Leaving them PENDING would silently
-- delist every existing facility from patient search.
UPDATE "Clinic"
   SET "approvalStatus" = 'APPROVED',
       "approvalDecidedAt" = CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN "verifiedByAdminId" TEXT;

-- AlterTable
-- Medical-registration checks moved from the clinic owner to the platform
-- review team, so the reviewer on an existing row may now be either. The
-- column is relaxed rather than replaced: historic clinic-recorded checks
-- keep their attribution, and the single writer of this table guarantees
-- exactly one of the two reviewer columns is set.
ALTER TABLE "DoctorVerification" ALTER COLUMN "checkedByStaffUserId" DROP NOT NULL;
ALTER TABLE "DoctorVerification" ADD COLUMN "checkedByAdminId" TEXT;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVerification" ADD CONSTRAINT "DoctorVerification_checkedByAdminId_fkey" FOREIGN KEY ("checkedByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminEvent" ADD CONSTRAINT "AdminEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
