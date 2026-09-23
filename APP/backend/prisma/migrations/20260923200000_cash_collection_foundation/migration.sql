-- Additive cash collection foundation: CASH payment method, rental collection mode, liability CASH channel.

-- AlterEnum
ALTER TYPE "ContractPaymentMethod" ADD VALUE 'CASH';

-- CreateEnum
CREATE TYPE "RentalCollectionMode" AS ENUM ('ELECTRONIC', 'CASH');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "collectionMode" "RentalCollectionMode",
ADD COLUMN     "collectionModeSelectedAt" TIMESTAMP(3),
ADD COLUMN     "collectionModeSelectedByUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_collectionModeSelectedByUserId_fkey" FOREIGN KEY ("collectionModeSelectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "RoadLiabilitySettlementChannel" ADD VALUE 'CASH';
