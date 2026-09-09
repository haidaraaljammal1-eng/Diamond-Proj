-- CreateEnum
CREATE TYPE "TarsOperationType" AS ENUM ('REGISTER_CONTRACT', 'CONTRACT_ACCEPTANCE', 'HANDOVER', 'RETURN_DOCUMENTATION', 'COMPLETE_CONTRACT');

-- CreateEnum
CREATE TYPE "TarsOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "tars_contract_integrations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "externalContractId" TEXT,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tars_contract_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tars_operations" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "operationType" "TarsOperationType" NOT NULL,
    "status" "TarsOperationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT,
    "requestFingerprint" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "externalReference" TEXT,
    "providerOperationId" TEXT,
    "lastErrorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tars_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tars_contract_integrations_contractId_key" ON "tars_contract_integrations"("contractId");

-- CreateIndex
CREATE INDEX "tars_contract_integrations_externalContractId_idx" ON "tars_contract_integrations"("externalContractId");

-- CreateIndex
CREATE INDEX "tars_operations_contractId_operationType_createdAt_idx" ON "tars_operations"("contractId", "operationType", "createdAt");

-- CreateIndex
CREATE INDEX "tars_operations_integrationId_status_idx" ON "tars_operations"("integrationId", "status");

-- AddForeignKey
ALTER TABLE "tars_contract_integrations" ADD CONSTRAINT "tars_contract_integrations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_operations" ADD CONSTRAINT "tars_operations_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "tars_contract_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_operations" ADD CONSTRAINT "tars_operations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
