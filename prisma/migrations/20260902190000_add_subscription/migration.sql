-- A clinic's commercial relationship with ApnaHealth.
--
-- Holds NO card, bank or payment-instrument data. Card handling belongs to
-- the payment provider; storing it here would pull this codebase into PCI
-- scope for no benefit.

CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'STARTER', 'GROWTH');

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'TRIAL',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "doctorSeats" INTEGER NOT NULL DEFAULT 1,
    "trialEndsAt" TIMESTAMPTZ(3),
    "currentPeriodStartAt" TIMESTAMPTZ(3),
    "currentPeriodEndAt" TIMESTAMPTZ(3),
    "gracePeriodEndsAt" TIMESTAMPTZ(3),
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_clinicId_key" ON "Subscription"("clinicId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only history of every commercial state change.
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "fromStatus" "SubscriptionStatus",
    "toStatus" "SubscriptionStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,
    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionEvent_subscriptionId_occurredAt_idx"
    ON "SubscriptionEvent"("subscriptionId", "occurredAt");

ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every clinic that already exists is granted an ACTIVE subscription, not
-- a trial.
--
-- These clinics predate billing entirely. Starting them on a 14-day trial
-- would suspend every existing customer a fortnight after this deploys,
-- for a charge they were never asked to pay and a plan they never chose.
-- Introducing billing must never retroactively bill or disable anyone:
-- moving them onto a paid plan is a commercial conversation, not a
-- migration.
--
-- Seats are set to their current doctor count, floored at the STARTER
-- allowance, so nobody is instantly over their limit.
INSERT INTO "Subscription" ("id", "clinicId", "plan", "status", "doctorSeats", "currentPeriodStartAt", "createdAt", "updatedAt")
SELECT
    'sub_' || substr(md5(random()::text || c."id"), 1, 21),
    c."id",
    'STARTER',
    'ACTIVE',
    GREATEST(3, (SELECT COUNT(*) FROM "Doctor" d WHERE d."clinicId" = c."id")),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Clinic" c;
