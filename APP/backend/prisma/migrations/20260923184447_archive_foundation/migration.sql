-- CreateTable
CREATE TABLE "archive_rows" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "rowOrder" INTEGER NOT NULL,
    "kmIn" INTEGER,
    "km" INTEGER,
    "kmOut" INTEGER,
    "deliveryDate" DATE,
    "deliveryTime" TEXT,
    "returnDate" DATE,
    "returnTime" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "description" TEXT,
    "days" INTEGER,
    "dailyRate" INTEGER,
    "rentalTotal" INTEGER,
    "salik" INTEGER,
    "parking" INTEGER,
    "fuel" INTEGER,
    "blackPoints" INTEGER,
    "fines" INTEGER,
    "total" INTEGER,
    "dollar" INTEGER,
    "cash" INTEGER,
    "visa" INTEGER,
    "transfer" INTEGER,
    "remaining" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archive_rows_vehicleId_idx" ON "archive_rows"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "archive_rows_vehicleId_rowOrder_key" ON "archive_rows"("vehicleId", "rowOrder");

-- AddForeignKey
ALTER TABLE "archive_rows" ADD CONSTRAINT "archive_rows_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
