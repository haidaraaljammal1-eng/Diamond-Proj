-- CreateEnum
CREATE TYPE "VehicleOperationalStatus" AS ENUM ('AVAILABLE', 'RENTED', 'SERVICE');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "plateNumber" TEXT,
ADD COLUMN     "dailyRate" INTEGER,
ADD COLUMN     "monthlyRate" INTEGER,
ADD COLUMN     "operationalStatus" "VehicleOperationalStatus" NOT NULL DEFAULT 'AVAILABLE';

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plateNumber_key" ON "vehicles"("plateNumber");

-- CreateIndex
CREATE INDEX "vehicles_operationalStatus_idx" ON "vehicles"("operationalStatus");

-- CreateTable
CREATE TABLE "vehicle_photos" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_photos_vehicleId_sortOrder_idx" ON "vehicle_photos"("vehicleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_photos_vehicleId_attachmentId_key" ON "vehicle_photos"("vehicleId", "attachmentId");

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
