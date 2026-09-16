-- CreateEnum
CREATE TYPE "FinancialLedgerKind" AS ENUM ('RENTAL_PAYMENT', 'RENEWAL_PAYMENT', 'RECONCILIATION_PAYMENT', 'POST_CLOSE_RECEIVABLE_PAYMENT', 'MAINTENANCE_EXPENSE', 'MANUAL_EXPENSE', 'MANUAL_EXPENSE_REVERSAL');

-- CreateEnum
CREATE TYPE "FinancialLedgerSourceType" AS ENUM ('CONTRACT_PAYMENT', 'MAINTENANCE_ORDER', 'MANUAL_EXPENSE');

-- CreateEnum
CREATE TYPE "ManualExpenseCategory" AS ENUM ('VEHICLE_CLEANING', 'FUEL', 'PARKING', 'GOVERNMENT_FEES', 'OFFICE_ADMIN', 'MARKETING', 'OPERATIONS', 'OTHER');

-- CreateEnum
CREATE TYPE "ManualExpenseStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateTable
CREATE TABLE "manual_expenses" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "category" "ManualExpenseCategory" NOT NULL,
    "recognizedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "vehicleId" INTEGER,
    "vendorName" TEXT,
    "receiptNumber" TEXT,
    "attachmentId" TEXT,
    "note" TEXT,
    "status" "ManualExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "correctionOfExpenseId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" INTEGER,
    "voidReason" TEXT,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger_entries" (
    "id" TEXT NOT NULL,
    "kind" "FinancialLedgerKind" NOT NULL,
    "sourceType" "FinancialLedgerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "contractId" TEXT,
    "customerId" INTEGER,
    "vehicleId" INTEGER,
    "contractPaymentId" TEXT,
    "maintenanceOrderId" INTEGER,
    "manualExpenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_ledger_entries_dedupeKey_key" ON "financial_ledger_entries"("dedupeKey");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_occurredAt_idx" ON "financial_ledger_entries"("occurredAt");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_kind_idx" ON "financial_ledger_entries"("kind");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_sourceType_idx" ON "financial_ledger_entries"("sourceType");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_contractId_idx" ON "financial_ledger_entries"("contractId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_customerId_idx" ON "financial_ledger_entries"("customerId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_vehicleId_idx" ON "financial_ledger_entries"("vehicleId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_manualExpenseId_idx" ON "financial_ledger_entries"("manualExpenseId");

-- CreateIndex
CREATE INDEX "manual_expenses_recognizedAt_idx" ON "manual_expenses"("recognizedAt");

-- CreateIndex
CREATE INDEX "manual_expenses_status_idx" ON "manual_expenses"("status");

-- CreateIndex
CREATE INDEX "manual_expenses_category_idx" ON "manual_expenses"("category");

-- CreateIndex
CREATE INDEX "manual_expenses_vehicleId_idx" ON "manual_expenses"("vehicleId");

-- CreateIndex
CREATE INDEX "manual_expenses_createdByUserId_idx" ON "manual_expenses"("createdByUserId");

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_correctionOfExpenseId_fkey" FOREIGN KEY ("correctionOfExpenseId") REFERENCES "manual_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_contractPaymentId_fkey" FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_manualExpenseId_fkey" FOREIGN KEY ("manualExpenseId") REFERENCES "manual_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Safe Stripe payment backfill (trusted CARD + provider stripe + confirmedAt only)
INSERT INTO "financial_ledger_entries" (
    "id", "kind", "sourceType", "sourceId", "dedupeKey", "amount", "currency", "occurredAt",
    "contractId", "customerId", "vehicleId", "contractPaymentId", "createdAt"
)
SELECT
    gen_random_uuid()::text,
    CASE cp."purpose"
        WHEN 'RENTAL' THEN 'RENTAL_PAYMENT'::"FinancialLedgerKind"
        WHEN 'RENEWAL' THEN 'RENEWAL_PAYMENT'::"FinancialLedgerKind"
        WHEN 'RECONCILIATION' THEN 'RECONCILIATION_PAYMENT'::"FinancialLedgerKind"
        WHEN 'POST_CLOSE_RECEIVABLE' THEN 'POST_CLOSE_RECEIVABLE_PAYMENT'::"FinancialLedgerKind"
    END,
    'CONTRACT_PAYMENT'::"FinancialLedgerSourceType",
    cp."id",
    'payment:' || cp."id",
    cp."amount",
    cp."currency",
    cp."confirmedAt",
    cp."contractId",
    c."customerId",
    c."vehicleId",
    cp."id",
    NOW()
FROM "contract_payments" cp
JOIN "contracts" c ON c."id" = cp."contractId"
WHERE cp."status" = 'CONFIRMED'
  AND cp."method" = 'CARD'
  AND cp."provider" = 'stripe'
  AND cp."confirmedAt" IS NOT NULL
ON CONFLICT ("dedupeKey") DO NOTHING;

-- Safe completed maintenance expense backfill
INSERT INTO "financial_ledger_entries" (
    "id", "kind", "sourceType", "sourceId", "dedupeKey", "amount", "currency", "occurredAt",
    "vehicleId", "maintenanceOrderId", "createdAt"
)
SELECT
    gen_random_uuid()::text,
    'MAINTENANCE_EXPENSE'::"FinancialLedgerKind",
    'MAINTENANCE_ORDER'::"FinancialLedgerSourceType",
    mo."id"::text,
    'maintenance:' || mo."id"::text,
    mo."cost",
    'AED',
    mo."completedAt",
    mo."vehicleId",
    mo."id",
    NOW()
FROM "maintenance_orders" mo
WHERE mo."status" = 'COMPLETED'
  AND mo."cost" IS NOT NULL
  AND mo."completedAt" IS NOT NULL
ON CONFLICT ("dedupeKey") DO NOTHING;
