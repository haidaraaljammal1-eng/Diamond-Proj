-- Stripe Checkout attempt foundation: immutable provider attempts per ContractPayment.

CREATE TYPE "ContractPaymentAttemptStatus" AS ENUM (
  'PREPARING',
  'RECOVERING',
  'READY',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED'
);

CREATE TABLE "contract_payment_attempts" (
  "id" TEXT NOT NULL,
  "contractPaymentId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "providerAccountKey" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "purpose" "ContractPaymentPurpose" NOT NULL,
  "contractId" TEXT NOT NULL,
  "companyCode" TEXT,
  "locale" TEXT NOT NULL,
  "savePaymentMethodForFutureUse" BOOLEAN NOT NULL DEFAULT false,
  "consentVersion" TEXT,
  "statusTokenHash" TEXT NOT NULL,
  "successUrl" TEXT NOT NULL,
  "cancelUrl" TEXT NOT NULL,
  "stripeCustomerId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status" "ContractPaymentAttemptStatus" NOT NULL DEFAULT 'PREPARING',
  "providerReference" TEXT,
  "checkoutUrl" TEXT,
  "checkoutExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contract_payment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_payment_attempts_statusTokenHash_key"
  ON "contract_payment_attempts"("statusTokenHash");

CREATE UNIQUE INDEX "contract_payment_attempts_idempotencyKey_key"
  ON "contract_payment_attempts"("idempotencyKey");

CREATE UNIQUE INDEX "contract_payment_attempts_providerReference_key"
  ON "contract_payment_attempts"("providerReference");

CREATE INDEX "contract_payment_attempts_contractPaymentId_status_idx"
  ON "contract_payment_attempts"("contractPaymentId", "status");

CREATE INDEX "contract_payment_attempts_contractPaymentId_createdAt_idx"
  ON "contract_payment_attempts"("contractPaymentId", "createdAt");

CREATE UNIQUE INDEX "contract_payment_attempts_one_active_per_payment_idx"
  ON "contract_payment_attempts"("contractPaymentId")
  WHERE "status" IN ('PREPARING', 'RECOVERING', 'READY');

ALTER TABLE "contract_payment_attempts"
  ADD CONSTRAINT "contract_payment_attempts_contractPaymentId_fkey"
  FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
