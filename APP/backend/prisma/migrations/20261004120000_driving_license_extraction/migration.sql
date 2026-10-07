-- CreateEnum
CREATE TYPE "DrivingLicenseExtractionStatus" AS ENUM ('PROCESSING', 'READY', 'PARTIAL', 'FAILED', 'PROVIDER_UNAVAILABLE');

-- CreateTable
CREATE TABLE "driving_license_extractions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "status" "DrivingLicenseExtractionStatus" NOT NULL DEFAULT 'PROCESSING',
    "engineDocumentStatus" TEXT,
    "jobId" TEXT,
    "provider" TEXT,
    "providerVersion" TEXT,
    "licenseNumber" TEXT,
    "holderNameEn" TEXT,
    "nationality" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "placeOfIssue" TEXT,
    "fieldsMeta" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driving_license_extractions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "driving_license_verifications" ADD COLUMN "extractionId" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "dateOfBirth" TIMESTAMP(3),
ADD COLUMN "drivingLicenseIssueDate" TIMESTAMP(3),
ADD COLUMN "drivingLicensePlaceOfIssue" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "driving_license_extractions_documentId_key" ON "driving_license_extractions"("documentId");

-- CreateIndex
CREATE INDEX "driving_license_extractions_contractId_createdAt_idx" ON "driving_license_extractions"("contractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "driving_license_verifications_extractionId_key" ON "driving_license_verifications"("extractionId");

-- AddForeignKey
ALTER TABLE "driving_license_verifications" ADD CONSTRAINT "driving_license_verifications_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "driving_license_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_license_extractions" ADD CONSTRAINT "driving_license_extractions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_license_extractions" ADD CONSTRAINT "driving_license_extractions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "contract_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
