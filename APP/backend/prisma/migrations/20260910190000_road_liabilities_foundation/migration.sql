-- CreateEnum
CREATE TYPE "RoadLiabilityType" AS ENUM ('RTA_VIOLATION', 'SALIK_TOLL', 'SALIK_VIOLATION');

-- CreateEnum
CREATE TYPE "RoadLiabilityConfirmationStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoadLiabilityAttributionStatus" AS ENUM ('UNRESOLVED', 'MATCHED', 'UNMATCHED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "RoadLiabilityCollectionStatus" AS ENUM ('NOT_READY', 'OPEN', 'SETTLED', 'DISPUTED', 'VOID');

-- CreateEnum
CREATE TYPE "RoadLiabilityConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "toll_gates" (
    "id" TEXT NOT NULL,
    "networkKey" TEXT NOT NULL,
    "externalGateCode" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "lineStartLatitude" DECIMAL(10,7) NOT NULL,
    "lineStartLongitude" DECIMAL(11,7) NOT NULL,
    "lineEndLatitude" DECIMAL(10,7) NOT NULL,
    "lineEndLongitude" DECIMAL(11,7) NOT NULL,
    "corridorMeters" DECIMAL(8,2) NOT NULL,
    "allowedHeadingDegrees" DECIMAL(6,2),
    "headingToleranceDegrees" DECIMAL(6,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "toll_gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_liabilities" (
    "id" TEXT NOT NULL,
    "type" "RoadLiabilityType" NOT NULL,
    "vehicleId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "gateId" TEXT,
    "locationLabel" TEXT,
    "amount" INTEGER,
    "currency" TEXT,
    "authoritativeSourceKey" TEXT,
    "authoritativeExternalReference" TEXT,
    "confirmationStatus" "RoadLiabilityConfirmationStatus" NOT NULL,
    "attributionStatus" "RoadLiabilityAttributionStatus" NOT NULL,
    "collectionStatus" "RoadLiabilityCollectionStatus" NOT NULL,
    "attributedContractId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "road_liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_liability_observations" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "authoritative" BOOLEAN NOT NULL,
    "externalEventId" TEXT,
    "ingestionFingerprint" TEXT NOT NULL,
    "eventType" "RoadLiabilityType" NOT NULL,
    "vehicleId" INTEGER,
    "plateNumberNormalized" TEXT,
    "externalVehicleRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER,
    "currency" TEXT,
    "externalReference" TEXT,
    "gateId" TEXT,
    "locationLabel" TEXT,
    "confidence" "RoadLiabilityConfidence",
    "liabilityId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_liability_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "toll_gates_networkKey_isActive_idx" ON "toll_gates"("networkKey", "isActive");

-- CreateIndex
CREATE INDEX "toll_gates_externalGateCode_idx" ON "toll_gates"("externalGateCode");

-- CreateIndex
CREATE INDEX "road_liabilities_occurredAt_idx" ON "road_liabilities"("occurredAt");

-- CreateIndex
CREATE INDEX "road_liabilities_type_idx" ON "road_liabilities"("type");

-- CreateIndex
CREATE INDEX "road_liabilities_confirmationStatus_idx" ON "road_liabilities"("confirmationStatus");

-- CreateIndex
CREATE INDEX "road_liabilities_attributionStatus_idx" ON "road_liabilities"("attributionStatus");

-- CreateIndex
CREATE INDEX "road_liabilities_collectionStatus_idx" ON "road_liabilities"("collectionStatus");

-- CreateIndex
CREATE INDEX "road_liabilities_vehicleId_occurredAt_idx" ON "road_liabilities"("vehicleId", "occurredAt");

-- CreateIndex
CREATE INDEX "road_liabilities_attributedContractId_idx" ON "road_liabilities"("attributedContractId");

-- CreateIndex
CREATE INDEX "road_liabilities_authoritativeSourceKey_idx" ON "road_liabilities"("authoritativeSourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "road_liability_observations_ingestionFingerprint_key" ON "road_liability_observations"("ingestionFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "road_liability_observations_sourceKey_externalEventId_key" ON "road_liability_observations"("sourceKey", "externalEventId");

-- CreateIndex
CREATE INDEX "road_liability_observations_sourceKey_occurredAt_idx" ON "road_liability_observations"("sourceKey", "occurredAt");

-- CreateIndex
CREATE INDEX "road_liability_observations_vehicleId_gateId_occurredAt_idx" ON "road_liability_observations"("vehicleId", "gateId", "occurredAt");

-- CreateIndex
CREATE INDEX "road_liability_observations_liabilityId_idx" ON "road_liability_observations"("liabilityId");

-- CreateIndex
CREATE INDEX "road_liability_observations_eventType_occurredAt_idx" ON "road_liability_observations"("eventType", "occurredAt");

-- AddForeignKey
ALTER TABLE "road_liabilities" ADD CONSTRAINT "road_liabilities_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liabilities" ADD CONSTRAINT "road_liabilities_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "toll_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liabilities" ADD CONSTRAINT "road_liabilities_attributedContractId_fkey" FOREIGN KEY ("attributedContractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_observations" ADD CONSTRAINT "road_liability_observations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_observations" ADD CONSTRAINT "road_liability_observations_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "toll_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_observations" ADD CONSTRAINT "road_liability_observations_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "road_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
