-- Webhook deliveries we have already acted on.
--
-- Razorpay retries until it receives a 2xx and may redeliver an event even
-- after success. Without this, a retried subscription.charged would extend
-- a billing period twice, and a replayed subscription.cancelled could
-- cancel a clinic that had since resubscribed.
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- The uniqueness constraint IS the idempotency mechanism: two concurrent
-- deliveries of the same event race to insert, and exactly one wins.
CREATE UNIQUE INDEX "ProcessedWebhookEvent_provider_eventId_key"
    ON "ProcessedWebhookEvent"("provider", "eventId");
CREATE INDEX "ProcessedWebhookEvent_processedAt_idx"
    ON "ProcessedWebhookEvent"("processedAt");
