-- TARS official-foundation redesign: official capabilities, async statuses,
-- Vehicle DID, OTP challenges, attachment upload mapping. Legacy operation
-- types and rows are preserved.

-- New operation types
ALTER TYPE "TarsOperationType" ADD VALUE 'CREATE_RENTAL';
ALTER TYPE "TarsOperationType" ADD VALUE 'UPDATE_RENTAL';
ALTER TYPE "TarsOperationType" ADD VALUE 'RETURN_RENTAL';
ALTER TYPE "TarsOperationType" ADD VALUE 'SETTLE_RENTAL';

-- Async lifecycle statuses
ALTER TYPE "TarsOperationStatus" ADD VALUE 'SUBMITTING';
ALTER TYPE "TarsOperationStatus" ADD VALUE 'PENDING_PROVIDER';

-- Map legacy in-flight rows to the new vocabulary
UPDATE "tars_operations" SET "status" = 'SUBMITTING' WHERE "status" IN ('PENDING', 'PROCESSING');

-- Vehicle sync status
CREATE TYPE "TarsVehicleSyncStatus" AS ENUM (
  'NOT_STARTED',
  'SUBMITTING',
  'PENDING_PROVIDER',
  'SYNCED',
  'FAILED'
);

-- OTP verification status
CREATE TYPE "TarsOtpVerificationStatus" AS ENUM (
  'REQUESTED',
  'VERIFIED',
  'EXPIRED',
  'FAILED'
);

-- Contract integration: Rental DID
ALTER TABLE "tars_contract_integrations" ADD COLUMN "externalRentalDid" TEXT;
CREATE INDEX "tars_contract_integrations_externalRentalDid_idx"
  ON "tars_contract_integrations"("externalRentalDid");

-- Operation: correlation + async request id
ALTER TABLE "tars_operations" ADD COLUMN "correlationSubject" TEXT;
ALTER TABLE "tars_operations" ADD COLUMN "providerRequestId" TEXT;
CREATE INDEX "tars_operations_correlationSubject_idx"
  ON "tars_operations"("contractId", "operationType", "correlationSubject");
CREATE INDEX "tars_operations_providerRequestId_idx"
  ON "tars_operations"("providerRequestId");

-- Vehicle TARS DID (scoped per company)
CREATE TABLE "tars_vehicle_integrations" (
  "id" TEXT NOT NULL,
  "vehicleId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "externalVehicleDid" TEXT,
  "syncStatus" "TarsVehicleSyncStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tars_vehicle_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tars_vehicle_integrations_vehicleId_companyId_key"
  ON "tars_vehicle_integrations"("vehicleId", "companyId");
CREATE INDEX "tars_vehicle_integrations_companyId_externalVehicleDid_idx"
  ON "tars_vehicle_integrations"("companyId", "externalVehicleDid");

ALTER TABLE "tars_vehicle_integrations"
  ADD CONSTRAINT "tars_vehicle_integrations_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tars_vehicle_integrations"
  ADD CONSTRAINT "tars_vehicle_integrations_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Attachment upload mapping per company
CREATE TABLE "tars_attachment_uploads" (
  "id" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "externalUrl" TEXT,
  "externalHash" TEXT,
  "uploadedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tars_attachment_uploads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tars_attachment_uploads_attachmentId_companyId_key"
  ON "tars_attachment_uploads"("attachmentId", "companyId");
CREATE INDEX "tars_attachment_uploads_companyId_idx"
  ON "tars_attachment_uploads"("companyId");

ALTER TABLE "tars_attachment_uploads"
  ADD CONSTRAINT "tars_attachment_uploads_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tars_attachment_uploads"
  ADD CONSTRAINT "tars_attachment_uploads_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OTP challenge (no OTP value column)
CREATE TABLE "tars_contract_otp_challenges" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "challengeReference" TEXT,
  "maskedDestination" TEXT,
  "status" "TarsOtpVerificationStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tars_contract_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tars_contract_otp_challenges_contractId_createdAt_idx"
  ON "tars_contract_otp_challenges"("contractId", "createdAt");
CREATE INDEX "tars_contract_otp_challenges_contractId_status_idx"
  ON "tars_contract_otp_challenges"("contractId", "status");

ALTER TABLE "tars_contract_otp_challenges"
  ADD CONSTRAINT "tars_contract_otp_challenges_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
