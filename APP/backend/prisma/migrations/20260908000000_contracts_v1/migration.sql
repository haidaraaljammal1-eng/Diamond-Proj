-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('AWAITING', 'FORM', 'SIGNED', 'PAID', 'ACTIVE', 'RETOUT', 'REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContractPriceType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ContractLinkType" AS ENUM ('RENTAL', 'RETURN', 'RENEWAL');

-- CreateEnum
CREATE TYPE "ContractPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'MANUAL');

-- CreateEnum
CREATE TYPE "ContractPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerDocumentType" AS ENUM ('IDENTITY', 'PASSPORT', 'DRIVING_LICENSE');

-- CreateEnum
CREATE TYPE "ContractReconciliationLineType" AS ENUM ('DAMAGE', 'FUEL', 'LATE', 'SALIK', 'VIOLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractInspectionAngle" AS ENUM ('FRONT', 'REAR', 'RIGHT_SIDE', 'LEFT_SIDE', 'FRONT_PLATE', 'REAR_PLATE', 'INTERIOR_ODOMETER', 'TIRES');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "drivingLicenseExpiry" TIMESTAMP(3),
ADD COLUMN     "drivingLicenseNumber" TEXT,
ADD COLUMN     "identityNumber" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "passportNumber" TEXT;

-- CreateTable
CREATE TABLE "contract_number_sequences" (
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contract_number_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'AWAITING',
    "vehicleId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "assignedEmployeeUserId" INTEGER,
    "priceType" "ContractPriceType" NOT NULL,
    "rentalDays" INTEGER NOT NULL,
    "agreedAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "depositAmount" INTEGER,
    "snapshot" JSONB,
    "termsVersion" TEXT NOT NULL DEFAULT 'diamond-rental-terms-v1',
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_links" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "ContractLinkType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,

    CONSTRAINT "contract_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_acceptances" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "termsVersion" TEXT NOT NULL,
    "signatureAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "method" "ContractPaymentMethod" NOT NULL,
    "status" "ContractPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,

    CONSTRAINT "contract_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_outs" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "performedByUserId" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "mileageOut" INTEGER NOT NULL,
    "fuelOut" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_out_photos" (
    "id" TEXT NOT NULL,
    "carOutId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "angle" "ContractInspectionAngle" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_out_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_ins" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "mileageIn" INTEGER NOT NULL,
    "fuelIn" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_in_photos" (
    "id" TEXT NOT NULL,
    "carInId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "angle" "ContractInspectionAngle" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_in_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_reconciliations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "chargesTotal" INTEGER NOT NULL,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "deductions" INTEGER NOT NULL DEFAULT 0,
    "finalAmount" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_reconciliation_lines" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "type" "ContractReconciliationLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "externalReference" TEXT,
    "sourceDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_reconciliation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_renewals" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "additionalDays" INTEGER NOT NULL,
    "additionalAmount" INTEGER NOT NULL,
    "previousEndAt" TIMESTAMP(3) NOT NULL,
    "newEndAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "createdByUserId" INTEGER,

    CONSTRAINT "contract_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_documents" (
    "id" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "type" "CustomerDocumentType" NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contractNumber_key" ON "contracts"("contractNumber");

-- CreateIndex
CREATE INDEX "contracts_vehicleId_status_idx" ON "contracts"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "contracts_customerId_idx" ON "contracts"("customerId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_createdAt_idx" ON "contracts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "contract_links_tokenHash_key" ON "contract_links"("tokenHash");

-- CreateIndex
CREATE INDEX "contract_links_contractId_type_idx" ON "contract_links"("contractId", "type");

-- CreateIndex
CREATE INDEX "contract_links_expiresAt_idx" ON "contract_links"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "contract_acceptances_contractId_key" ON "contract_acceptances"("contractId");

-- CreateIndex
CREATE INDEX "contract_payments_contractId_status_idx" ON "contract_payments"("contractId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_outs_contractId_key" ON "contract_car_outs"("contractId");

-- CreateIndex
CREATE INDEX "contract_car_out_photos_carOutId_sortOrder_idx" ON "contract_car_out_photos"("carOutId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_photos_carOutId_angle_key" ON "contract_car_out_photos"("carOutId", "angle");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_photos_carOutId_attachmentId_key" ON "contract_car_out_photos"("carOutId", "attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_ins_contractId_key" ON "contract_car_ins"("contractId");

-- CreateIndex
CREATE INDEX "contract_car_in_photos_carInId_sortOrder_idx" ON "contract_car_in_photos"("carInId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_photos_carInId_angle_key" ON "contract_car_in_photos"("carInId", "angle");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_photos_carInId_attachmentId_key" ON "contract_car_in_photos"("carInId", "attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_reconciliations_contractId_key" ON "contract_reconciliations"("contractId");

-- CreateIndex
CREATE INDEX "contract_reconciliation_lines_reconciliationId_idx" ON "contract_reconciliation_lines"("reconciliationId");

-- CreateIndex
CREATE INDEX "contract_renewals_contractId_createdAt_idx" ON "contract_renewals"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_documents_customerId_type_idx" ON "customer_documents"("customerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "customer_documents_customerId_attachmentId_key" ON "customer_documents"("customerId", "attachmentId");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_assignedEmployeeUserId_fkey" FOREIGN KEY ("assignedEmployeeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_links" ADD CONSTRAINT "contract_links_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_links" ADD CONSTRAINT "contract_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_signatureAttachmentId_fkey" FOREIGN KEY ("signatureAttachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_outs" ADD CONSTRAINT "contract_car_outs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_outs" ADD CONSTRAINT "contract_car_outs_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_photos" ADD CONSTRAINT "contract_car_out_photos_carOutId_fkey" FOREIGN KEY ("carOutId") REFERENCES "contract_car_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_photos" ADD CONSTRAINT "contract_car_out_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_ins" ADD CONSTRAINT "contract_car_ins_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_photos" ADD CONSTRAINT "contract_car_in_photos_carInId_fkey" FOREIGN KEY ("carInId") REFERENCES "contract_car_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_photos" ADD CONSTRAINT "contract_car_in_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliations" ADD CONSTRAINT "contract_reconciliations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliations" ADD CONSTRAINT "contract_reconciliations_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliation_lines" ADD CONSTRAINT "contract_reconciliation_lines_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "contract_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
