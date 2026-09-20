-- CreateTable
CREATE TABLE "contract_car_in_drafts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "mileageIn" INTEGER,
    "fuelIn" TEXT,
    "damageIn" JSONB,
    "notes" TEXT,
    "hirerSignatureAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_car_in_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_in_draft_photos" (
    "id" TEXT NOT NULL,
    "carInDraftId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "angle" "ContractInspectionAngle" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_in_draft_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_drafts_contractId_key" ON "contract_car_in_drafts"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_draft_photos_carInDraftId_angle_key" ON "contract_car_in_draft_photos"("carInDraftId", "angle");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_draft_photos_carInDraftId_attachmentId_key" ON "contract_car_in_draft_photos"("carInDraftId", "attachmentId");

-- AddForeignKey
ALTER TABLE "contract_car_in_drafts" ADD CONSTRAINT "contract_car_in_drafts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_drafts" ADD CONSTRAINT "contract_car_in_drafts_hirerSignatureAttachmentId_fkey" FOREIGN KEY ("hirerSignatureAttachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_draft_photos" ADD CONSTRAINT "contract_car_in_draft_photos_carInDraftId_fkey" FOREIGN KEY ("carInDraftId") REFERENCES "contract_car_in_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_draft_photos" ADD CONSTRAINT "contract_car_in_draft_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
