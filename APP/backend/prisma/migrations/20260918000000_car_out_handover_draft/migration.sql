-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContractInspectionAngle" ADD VALUE 'LEFT';
ALTER TYPE "ContractInspectionAngle" ADD VALUE 'RIGHT';
ALTER TYPE "ContractInspectionAngle" ADD VALUE 'FRONT_LEFT';
ALTER TYPE "ContractInspectionAngle" ADD VALUE 'FRONT_RIGHT';
ALTER TYPE "ContractInspectionAngle" ADD VALUE 'REAR_LEFT';
ALTER TYPE "ContractInspectionAngle" ADD VALUE 'REAR_RIGHT';
ALTER TYPE "ContractInspectionAngle" ADD VALUE 'ODOMETER';
ALTER TYPE "ContractInspectionAngle" ADD VALUE 'DASHBOARD_FUEL';
ALTER TYPE "ContractInspectionAngle" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "contract_car_outs" ADD COLUMN     "damageOut" JSONB,
ADD COLUMN     "hirerSignatureAttachmentId" TEXT,
ADD COLUMN     "vehicleId" INTEGER;

-- CreateTable
CREATE TABLE "contract_car_out_drafts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "mileageOut" INTEGER,
    "fuelOut" TEXT,
    "damageOut" JSONB,
    "notes" TEXT,
    "hirerSignatureAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_car_out_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_out_draft_photos" (
    "id" TEXT NOT NULL,
    "carOutDraftId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "angle" "ContractInspectionAngle" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_out_draft_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_drafts_contractId_key" ON "contract_car_out_drafts"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_draft_photos_carOutDraftId_angle_key" ON "contract_car_out_draft_photos"("carOutDraftId", "angle");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_draft_photos_carOutDraftId_attachmentId_key" ON "contract_car_out_draft_photos"("carOutDraftId", "attachmentId");

-- AddForeignKey
ALTER TABLE "contract_car_outs" ADD CONSTRAINT "contract_car_outs_hirerSignatureAttachmentId_fkey" FOREIGN KEY ("hirerSignatureAttachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_drafts" ADD CONSTRAINT "contract_car_out_drafts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_drafts" ADD CONSTRAINT "contract_car_out_drafts_hirerSignatureAttachmentId_fkey" FOREIGN KEY ("hirerSignatureAttachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_draft_photos" ADD CONSTRAINT "contract_car_out_draft_photos_carOutDraftId_fkey" FOREIGN KEY ("carOutDraftId") REFERENCES "contract_car_out_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_draft_photos" ADD CONSTRAINT "contract_car_out_draft_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
