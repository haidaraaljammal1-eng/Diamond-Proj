-- STRIPE-5: immediate road liability off-session collection foundation

-- Contract payment purpose for direct road-liability settlement
ALTER TYPE "ContractPaymentPurpose" ADD VALUE IF NOT EXISTS 'ROAD_LIABILITY';

-- Finance ledger kind for road-liability payments
ALTER TYPE "FinancialLedgerKind" ADD VALUE IF NOT EXISTS 'ROAD_LIABILITY_PAYMENT';

-- Direct collection destination on frozen customer charge
ALTER TYPE "RoadLiabilityCustomerChargeDestination" ADD VALUE IF NOT EXISTS 'DIRECT_COLLECTION';

CREATE TYPE "RoadLiabilityCollectionOperationalState" AS ENUM (
  'COLLECTIBLE',
  'PROCESSING',
  'PAID',
  'FAILED',
  'REQUIRES_ACTION',
  'MANUAL_PENDING',
  'PAYMENT_LINK_READY'
);

CREATE TYPE "RoadLiabilitySettlementChannel" AS ENUM (
  'OFF_SESSION',
  'CHECKOUT',
  'MANUAL'
);

CREATE TYPE "RoadLiabilityManualCollectionStatus" AS ENUM (
  'PENDING_RECEIPT',
  'CONFIRMED'
);

CREATE TYPE "ContractPaymentOffSessionAttemptStatus" AS ENUM (
  'PREPARING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REQUIRES_ACTION'
);

ALTER TABLE "road_liability_customer_charges"
  ADD COLUMN "operationalState" "RoadLiabilityCollectionOperationalState",
  ADD COLUMN "settlementChannel" "RoadLiabilitySettlementChannel",
  ADD COLUMN "contractPaymentId" TEXT,
  ADD COLUMN "manualSelectedByUserId" INTEGER,
  ADD COLUMN "manualSelectedAt" TIMESTAMP(3),
  ADD COLUMN "manualConfirmedByUserId" INTEGER,
  ADD COLUMN "manualConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "manualCollectionStatus" "RoadLiabilityManualCollectionStatus",
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "road_liability_customer_charges_contractPaymentId_key"
  ON "road_liability_customer_charges"("contractPaymentId");

CREATE INDEX "road_liability_customer_charges_operationalState_idx"
  ON "road_liability_customer_charges"("operationalState");

ALTER TABLE "road_liability_customer_charges"
  ADD CONSTRAINT "road_liability_customer_charges_contractPaymentId_fkey"
  FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "road_liability_customer_charges"
  ADD CONSTRAINT "road_liability_customer_charges_manualSelectedByUserId_fkey"
  FOREIGN KEY ("manualSelectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "road_liability_customer_charges"
  ADD CONSTRAINT "road_liability_customer_charges_manualConfirmedByUserId_fkey"
  FOREIGN KEY ("manualConfirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "contract_payment_off_session_attempts" (
  "id" TEXT NOT NULL,
  "contractPaymentId" TEXT NOT NULL,
  "customerChargeId" TEXT NOT NULL,
  "authorizationId" TEXT NOT NULL,
  "customerPaymentMethodId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountKey" TEXT,
  "livemode" BOOLEAN NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "providerReference" TEXT,
  "status" "ContractPaymentOffSessionAttemptStatus" NOT NULL DEFAULT 'PREPARING',
  "failureCode" TEXT,
  "declineCode" TEXT,
  "requiresAction" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "contract_payment_off_session_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_payment_off_session_attempts_idempotencyKey_key"
  ON "contract_payment_off_session_attempts"("idempotencyKey");

CREATE UNIQUE INDEX "contract_payment_off_session_attempts_providerReference_key"
  ON "contract_payment_off_session_attempts"("providerReference");

CREATE INDEX "contract_payment_off_session_attempts_contractPaymentId_status_idx"
  ON "contract_payment_off_session_attempts"("contractPaymentId", "status");

CREATE INDEX "contract_payment_off_session_attempts_customerChargeId_status_idx"
  ON "contract_payment_off_session_attempts"("customerChargeId", "status");

ALTER TABLE "contract_payment_off_session_attempts"
  ADD CONSTRAINT "contract_payment_off_session_attempts_contractPaymentId_fkey"
  FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_payment_off_session_attempts"
  ADD CONSTRAINT "contract_payment_off_session_attempts_customerChargeId_fkey"
  FOREIGN KEY ("customerChargeId") REFERENCES "road_liability_customer_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_payment_off_session_attempts"
  ADD CONSTRAINT "contract_payment_off_session_attempts_authorizationId_fkey"
  FOREIGN KEY ("authorizationId") REFERENCES "contract_payment_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_payment_off_session_attempts"
  ADD CONSTRAINT "contract_payment_off_session_attempts_customerPaymentMethodId_fkey"
  FOREIGN KEY ("customerPaymentMethodId") REFERENCES "customer_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
