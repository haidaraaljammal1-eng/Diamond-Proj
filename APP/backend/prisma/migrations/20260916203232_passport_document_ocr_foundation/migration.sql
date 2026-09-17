-- CreateEnum
CREATE TYPE "PassportExtractionStatus" AS ENUM ('PROCESSING', 'READY', 'NOT_RECOGNIZED', 'FAILED', 'PROVIDER_UNAVAILABLE');

-- AlterEnum
ALTER TYPE "ContractDocumentType" ADD VALUE 'PASSPORT';

-- CreateTable
CREATE TABLE "passport_extractions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "status" "PassportExtractionStatus" NOT NULL DEFAULT 'PROCESSING',
    "fullName" TEXT,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "passportIssueDate" TIMESTAMP(3),
    "passportExpiryDate" TIMESTAMP(3),
    "dateOfBirth" TIMESTAMP(3),
    "sex" TEXT,
    "issuingCountry" TEXT,
    "confidence" DOUBLE PRECISION,
    "provider" TEXT,
    "providerVersion" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passport_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "passport_extractions_documentId_key" ON "passport_extractions"("documentId");

-- CreateIndex
CREATE INDEX "passport_extractions_contractId_createdAt_idx" ON "passport_extractions"("contractId", "createdAt");

-- AddForeignKey
ALTER TABLE "passport_extractions" ADD CONSTRAINT "passport_extractions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_extractions" ADD CONSTRAINT "passport_extractions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "contract_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
