-- AlterEnum
ALTER TYPE "ContractPaymentStatus" ADD VALUE 'PROCESSING';

-- CreateEnum
CREATE TYPE "ContractDocumentType" AS ENUM ('DRIVING_LICENSE');

-- CreateEnum
CREATE TYPE "DrivingLicenseVerificationStatus" AS ENUM (
  'PENDING',
  'VALID',
  'EXPIRED',
  'UNREADABLE',
  'REVIEW_REQUIRED',
  'PROVIDER_UNAVAILABLE'
);

-- AlterTable
ALTER TABLE "contract_payments"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerReference" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "statusTokenHash" TEXT,
  ADD COLUMN "statusTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "contract_payments_statusTokenHash_key" ON "contract_payments"("statusTokenHash");

-- CreateTable
CREATE TABLE "contract_documents" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "type" "ContractDocumentType" NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "supersededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contract_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_documents_contractId_type_supersededAt_idx"
  ON "contract_documents"("contractId", "type", "supersededAt");

-- CreateTable
CREATE TABLE "driving_license_verifications" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "status" "DrivingLicenseVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "licenseNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "confidence" DOUBLE PRECISION,
  "provider" TEXT,
  "providerVersion" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driving_license_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driving_license_verifications_contractId_createdAt_idx"
  ON "driving_license_verifications"("contractId", "createdAt");

-- AddForeignKey
ALTER TABLE "contract_documents"
  ADD CONSTRAINT "contract_documents_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_documents"
  ADD CONSTRAINT "contract_documents_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driving_license_verifications"
  ADD CONSTRAINT "driving_license_verifications_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_license_verifications"
  ADD CONSTRAINT "driving_license_verifications_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "contract_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
