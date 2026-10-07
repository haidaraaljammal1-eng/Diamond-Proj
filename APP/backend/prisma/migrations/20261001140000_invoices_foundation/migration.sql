-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('RENTAL', 'RECONCILIATION', 'ROAD_LIABILITY', 'RENEWAL');
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'VOID');
CREATE TYPE "InvoiceLineType" AS ENUM ('RENTAL', 'RECONCILIATION_DAMAGE', 'RECONCILIATION_FUEL', 'RECONCILIATION_LATE', 'RECONCILIATION_OTHER', 'ROAD_LIABILITY_TRAFFIC', 'ROAD_LIABILITY_SALIK', 'ROAD_LIABILITY_OTHER', 'RENEWAL');
CREATE TYPE "InvoiceSourceType" AS ENUM ('CONTRACT_RENTAL', 'CONTRACT_RENEWAL', 'RECONCILIATION_LINE', 'ROAD_LIABILITY_CUSTOMER_CHARGE');
CREATE TYPE "InvoiceDeliveryChannel" AS ENUM ('WHATSAPP');
CREATE TYPE "InvoiceDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "invoiceType" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "companyId" INTEGER NOT NULL,
    "contractId" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "termsSnapshot" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "customerNameSnapshot" TEXT NOT NULL,
    "contractNumberSnapshot" TEXT NOT NULL,
    "vehicleNameSnapshot" TEXT NOT NULL,
    "plateNumberSnapshot" TEXT NOT NULL,
    "companyDisplayNameSnapshot" TEXT NOT NULL,
    "companyAddressSnapshot" TEXT,
    "companyEmailSnapshot" TEXT,
    "companyBrandKeySnapshot" TEXT NOT NULL,
    "subtotalAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "balanceDueSnapshot" INTEGER NOT NULL,
    "templateVersion" TEXT NOT NULL DEFAULT 'v1',
    "originEventKey" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "lineType" "InvoiceLineType" NOT NULL,
    "serviceLabel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitRate" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "sourceType" "InvoiceSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_deliveries" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "channel" "InvoiceDeliveryChannel" NOT NULL,
    "status" "InvoiceDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "recipientPhoneSnapshot" TEXT NOT NULL,
    "recipientNameSnapshot" TEXT,
    "messageSnapshot" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "requestedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_number_sequences" (
    "companyId" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL,
    "configuredAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_number_sequences_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companyId_invoiceNumber_key" ON "invoices"("companyId", "invoiceNumber");
CREATE UNIQUE INDEX "invoices_originEventKey_key" ON "invoices"("originEventKey");
CREATE INDEX "invoices_contractId_idx" ON "invoices"("contractId");
CREATE INDEX "invoices_vehicleId_idx" ON "invoices"("vehicleId");
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");
CREATE INDEX "invoices_companyId_issueDate_idx" ON "invoices"("companyId", "issueDate");
CREATE INDEX "invoices_invoiceType_idx" ON "invoices"("invoiceType");
CREATE INDEX "invoices_createdAt_idx" ON "invoices"("createdAt");

CREATE UNIQUE INDEX "invoice_lines_sourceType_sourceId_key" ON "invoice_lines"("sourceType", "sourceId");
CREATE INDEX "invoice_lines_invoiceId_position_idx" ON "invoice_lines"("invoiceId", "position");

CREATE UNIQUE INDEX "invoice_deliveries_idempotencyKey_key" ON "invoice_deliveries"("idempotencyKey");
CREATE INDEX "invoice_deliveries_invoiceId_createdAt_idx" ON "invoice_deliveries"("invoiceId", "createdAt");
CREATE INDEX "invoice_deliveries_status_idx" ON "invoice_deliveries"("status");
CREATE INDEX "invoice_deliveries_providerMessageId_idx" ON "invoice_deliveries"("providerMessageId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_number_sequences" ADD CONSTRAINT "invoice_number_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
