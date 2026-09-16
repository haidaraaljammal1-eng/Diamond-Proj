-- CreateEnum
CREATE TYPE "MaintenanceOrderStatus" AS ENUM ('SCHEDULED', 'IN_SERVICE', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('MECHANICAL', 'ELECTRICAL', 'TIRES', 'AIR_CONDITIONING', 'BODY', 'PERIODIC', 'OTHER');

-- CreateTable
CREATE TABLE "maintenance_orders" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "status" "MaintenanceOrderStatus" NOT NULL,
    "maintenanceType" "MaintenanceType" NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "workshopName" TEXT,
    "odometerIn" INTEGER,
    "expectedCompletionAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_orders_vehicleId_idx" ON "maintenance_orders"("vehicleId");

-- CreateIndex
CREATE INDEX "maintenance_orders_status_idx" ON "maintenance_orders"("status");

-- CreateIndex
CREATE INDEX "maintenance_orders_scheduledAt_idx" ON "maintenance_orders"("scheduledAt");

-- CreateIndex
CREATE INDEX "maintenance_orders_expectedCompletionAt_idx" ON "maintenance_orders"("expectedCompletionAt");

-- CreateIndex
CREATE INDEX "maintenance_orders_completedAt_idx" ON "maintenance_orders"("completedAt");

-- CreateIndex
CREATE INDEX "maintenance_orders_createdByUserId_idx" ON "maintenance_orders"("createdByUserId");

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
