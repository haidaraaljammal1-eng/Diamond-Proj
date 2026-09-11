-- Unified Stripe customer payment foundation (additive).

CREATE TYPE "ContractPaymentPurpose" AS ENUM (
  'RENTAL',
  'RENEWAL',
  'RECONCILIATION',
  'POST_CLOSE_RECEIVABLE'
);

ALTER TABLE "contract_payments"
  ADD COLUMN "purpose" "ContractPaymentPurpose" NOT NULL DEFAULT 'RENTAL',
  ADD COLUMN "targetId" TEXT,
  ADD COLUMN "checkoutUrl" TEXT,
  ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3);

UPDATE "contract_payments"
SET "targetId" = "contractId"
WHERE "targetId" IS NULL;

ALTER TABLE "contract_payments"
  ALTER COLUMN "targetId" SET NOT NULL;

ALTER TABLE "contract_reconciliations"
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "settledPaymentId" TEXT;

ALTER TABLE "contract_post_close_receivables"
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "settledPaymentId" TEXT;

ALTER TABLE "contract_renewals"
  ADD COLUMN "appliedAt" TIMESTAMP(3),
  ADD COLUMN "settledPaymentId" TEXT;

-- Historical renewals that were already applied before payment gating.
UPDATE "contract_renewals"
SET "appliedAt" = "approvedAt"
WHERE "approvedAt" IS NOT NULL AND "appliedAt" IS NULL;

CREATE TABLE "stripe_webhook_events" (
  "id" TEXT NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "outcome" TEXT,
  "error" TEXT,
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key"
  ON "stripe_webhook_events"("stripeEventId");

CREATE INDEX "stripe_webhook_events_receivedAt_idx"
  ON "stripe_webhook_events"("receivedAt");

CREATE UNIQUE INDEX "contract_reconciliations_settledPaymentId_key"
  ON "contract_reconciliations"("settledPaymentId");

CREATE UNIQUE INDEX "contract_post_close_receivables_settledPaymentId_key"
  ON "contract_post_close_receivables"("settledPaymentId");

CREATE UNIQUE INDEX "contract_renewals_settledPaymentId_key"
  ON "contract_renewals"("settledPaymentId");

CREATE INDEX "contract_payments_purpose_targetId_status_idx"
  ON "contract_payments"("purpose", "targetId", "status");

CREATE UNIQUE INDEX "contract_payments_confirmed_obligation_idx"
  ON "contract_payments"("purpose", "targetId")
  WHERE "status" = 'CONFIRMED';

CREATE UNIQUE INDEX "contract_payments_provider_reference_idx"
  ON "contract_payments"("provider", "providerReference")
  WHERE "providerReference" IS NOT NULL;

ALTER TABLE "contract_reconciliations"
  ADD CONSTRAINT "contract_reconciliations_settledPaymentId_fkey"
  FOREIGN KEY ("settledPaymentId") REFERENCES "contract_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_post_close_receivables"
  ADD CONSTRAINT "contract_post_close_receivables_settledPaymentId_fkey"
  FOREIGN KEY ("settledPaymentId") REFERENCES "contract_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_renewals"
  ADD CONSTRAINT "contract_renewals_settledPaymentId_fkey"
  FOREIGN KEY ("settledPaymentId") REFERENCES "contract_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
