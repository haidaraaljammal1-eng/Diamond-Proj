-- CreateEnum
CREATE TYPE "RoadChargeReferenceRegistryStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "RoadChargeReferenceProvenance" AS ENUM ('STAFF_MANUAL', 'PROVIDER_AUTHORITATIVE');

-- CreateTable
CREATE TABLE "road_charge_reference_registry" (
    "id" TEXT NOT NULL,
    "chargeCategory" "StaffRoadChargeCategory" NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "referenceNormalized" TEXT NOT NULL,
    "status" "RoadChargeReferenceRegistryStatus" NOT NULL,
    "provenance" "RoadChargeReferenceProvenance" NOT NULL,
    "roadLiabilityId" TEXT,
    "staffManualIdempotencyKey" TEXT,
    "reservedByUserId" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "road_charge_reference_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "road_charge_reference_registry_roadLiabilityId_idx" ON "road_charge_reference_registry"("roadLiabilityId");

-- CreateIndex
CREATE INDEX "road_charge_reference_registry_chargeCategory_referenceNormalized_idx" ON "road_charge_reference_registry"("chargeCategory", "referenceNormalized");

-- Partial unique: active reservations and confirmed references per category
CREATE UNIQUE INDEX "road_charge_reference_registry_active_category_ref_key"
ON "road_charge_reference_registry" ("chargeCategory", "referenceNormalized")
WHERE "status" IN ('RESERVED', 'CONFIRMED');

-- AddForeignKey
ALTER TABLE "road_charge_reference_registry" ADD CONSTRAINT "road_charge_reference_registry_roadLiabilityId_fkey" FOREIGN KEY ("roadLiabilityId") REFERENCES "road_liabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_charge_reference_registry" ADD CONSTRAINT "road_charge_reference_registry_reservedByUserId_fkey" FOREIGN KEY ("reservedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
