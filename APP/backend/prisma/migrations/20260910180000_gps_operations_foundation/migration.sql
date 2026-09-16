-- CreateEnum
CREATE TYPE "GpsMotionState" AS ENUM ('UNKNOWN', 'MOVING', 'PARKED');

-- CreateTable
CREATE TABLE "vehicle_gps_bindings" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "providerKey" TEXT NOT NULL,
    "externalDeviceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_gps_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_gps_latest_states" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "bindingId" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(11,7) NOT NULL,
    "speedKph" DECIMAL(8,3),
    "headingDegrees" DECIMAL(6,2),
    "accuracyMeters" DECIMAL(8,2),
    "motionState" "GpsMotionState" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_gps_latest_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_bindings_vehicleId_key" ON "vehicle_gps_bindings"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_gps_bindings_providerKey_externalDeviceId_idx" ON "vehicle_gps_bindings"("providerKey", "externalDeviceId");

-- CreateIndex
CREATE INDEX "vehicle_gps_bindings_isActive_idx" ON "vehicle_gps_bindings"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_latest_states_vehicleId_key" ON "vehicle_gps_latest_states"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_latest_states_bindingId_key" ON "vehicle_gps_latest_states"("bindingId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_latest_states_bindingId_sourceEventId_key" ON "vehicle_gps_latest_states"("bindingId", "sourceEventId");

-- CreateIndex
CREATE INDEX "vehicle_gps_latest_states_capturedAt_idx" ON "vehicle_gps_latest_states"("capturedAt");

-- CreateIndex
CREATE INDEX "vehicle_gps_latest_states_motionState_idx" ON "vehicle_gps_latest_states"("motionState");

-- AddForeignKey
ALTER TABLE "vehicle_gps_bindings" ADD CONSTRAINT "vehicle_gps_bindings_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gps_latest_states" ADD CONSTRAINT "vehicle_gps_latest_states_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gps_latest_states" ADD CONSTRAINT "vehicle_gps_latest_states_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "vehicle_gps_bindings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
