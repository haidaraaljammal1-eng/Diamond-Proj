-- CreateEnum
CREATE TYPE "OfficialContractSignatureSlot" AS ENUM ('HIRER', 'ADDITIONAL_DRIVER', 'SPONSOR', 'VEHICLE_OUT_HIRER', 'VEHICLE_IN_HIRER');

-- AlterTable
ALTER TABLE "official_contract_review_drafts" ADD COLUMN     "cardNumberLast4" TEXT,
ADD COLUMN     "contractNotes" TEXT,
ADD COLUMN     "damageIn" JSONB,
ADD COLUMN     "damageOut" JSONB,
ADD COLUMN     "extraKmRate" DECIMAL(10,2),
ADD COLUMN     "includedKmPerDay" INTEGER,
ADD COLUMN     "plateCode" TEXT;

-- CreateTable
CREATE TABLE "official_contract_signatures" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "slot" "OfficialContractSignatureSlot" NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_contract_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "official_contract_signatures_contractId_slot_key" ON "official_contract_signatures"("contractId", "slot");

-- AddForeignKey
ALTER TABLE "official_contract_signatures" ADD CONSTRAINT "official_contract_signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_contract_signatures" ADD CONSTRAINT "official_contract_signatures_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
