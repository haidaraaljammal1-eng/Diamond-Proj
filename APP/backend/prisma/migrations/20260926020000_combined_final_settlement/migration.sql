-- Combined final settlement: payment allocations + multi-renewal settlement per payment

CREATE TYPE "ContractPaymentAllocationPurpose" AS ENUM ('RECONCILIATION', 'RENEWAL');

CREATE TABLE "contract_payment_allocations" (
    "id" TEXT NOT NULL,
    "contractPaymentId" TEXT NOT NULL,
    "allocationPurpose" "ContractPaymentAllocationPurpose" NOT NULL,
    "targetId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_payment_allocations_payment_purpose_target_key"
    ON "contract_payment_allocations"("contractPaymentId", "allocationPurpose", "targetId");

CREATE INDEX "contract_payment_allocations_contractPaymentId_idx"
    ON "contract_payment_allocations"("contractPaymentId");

CREATE INDEX "contract_payment_allocations_targetId_idx"
    ON "contract_payment_allocations"("targetId");

ALTER TABLE "contract_payment_allocations"
    ADD CONSTRAINT "contract_payment_allocations_contractPaymentId_fkey"
    FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "contract_renewals_settledPaymentId_key";

CREATE INDEX "contract_renewals_settledPaymentId_idx" ON "contract_renewals"("settledPaymentId");
