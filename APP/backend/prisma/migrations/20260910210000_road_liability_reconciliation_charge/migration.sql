-- AlterTable
ALTER TABLE "contract_reconciliation_lines" ADD COLUMN     "adjustmentAmount" INTEGER,
ADD COLUMN     "adjustmentNote" TEXT,
ADD COLUMN     "adjustmentReason" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedByUserId" INTEGER,
ADD COLUMN     "officialAmountSnapshot" INTEGER,
ADD COLUMN     "roadLiabilityId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contract_reconciliation_lines_roadLiabilityId_key" ON "contract_reconciliation_lines"("roadLiabilityId");

-- AddForeignKey
ALTER TABLE "contract_reconciliation_lines" ADD CONSTRAINT "contract_reconciliation_lines_roadLiabilityId_fkey" FOREIGN KEY ("roadLiabilityId") REFERENCES "road_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliation_lines" ADD CONSTRAINT "contract_reconciliation_lines_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
