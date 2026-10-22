-- CreateTable
CREATE TABLE "vehicle_videos" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_videos_vehicleId_key" ON "vehicle_videos"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_videos_attachmentId_key" ON "vehicle_videos"("attachmentId");

-- AddForeignKey
ALTER TABLE "vehicle_videos" ADD CONSTRAINT "vehicle_videos_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_videos" ADD CONSTRAINT "vehicle_videos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
