-- CreateTable
CREATE TABLE "official_contract_review_drafts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "hirerName" TEXT,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "address" TEXT,
    "telephone" TEXT,
    "additionalDriverName" TEXT,
    "additionalDriverNationality" TEXT,
    "additionalDriverLicenseNumber" TEXT,
    "sponsorName" TEXT,
    "sponsorIdNumber" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_contract_review_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "official_contract_review_drafts_contractId_key" ON "official_contract_review_drafts"("contractId");

-- AddForeignKey
ALTER TABLE "official_contract_review_drafts" ADD CONSTRAINT "official_contract_review_drafts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
