-- Final reconciliation: public link type + staff finalization metadata
ALTER TYPE "ContractLinkType" ADD VALUE 'RECONCILIATION';

ALTER TABLE "contract_reconciliations"
  ADD COLUMN "finalizedAt" TIMESTAMP(3),
  ADD COLUMN "finalizedByUserId" INTEGER;

ALTER TABLE "contract_reconciliations"
  ADD CONSTRAINT "contract_reconciliations_finalizedByUserId_fkey"
  FOREIGN KEY ("finalizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
