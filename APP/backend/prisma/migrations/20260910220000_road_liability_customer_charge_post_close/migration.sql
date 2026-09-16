CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE "RoadLiabilityCustomerChargeDestination" AS ENUM ('RECONCILIATION', 'POST_CLOSE_RECEIVABLE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ContractPostCloseReceivableStatus" AS ENUM ('OPEN', 'SETTLED', 'VOID');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "road_liability_customer_charges" (
    "id" TEXT NOT NULL,
    "roadLiabilityId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "destinationType" "RoadLiabilityCustomerChargeDestination" NOT NULL,
    "officialAmountSnapshot" INTEGER NOT NULL,
    "customerChargeAmount" INTEGER NOT NULL,
    "adjustmentAmount" INTEGER NOT NULL,
    "adjustmentReason" TEXT,
    "adjustmentNote" TEXT,
    "confirmedByUserId" INTEGER,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "reconciliationLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_liability_customer_charges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "contract_post_close_receivables" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "customerChargeId" TEXT NOT NULL,
    "roadLiabilityId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "ContractPostCloseReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_post_close_receivables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "road_liability_customer_charges_roadLiabilityId_key" ON "road_liability_customer_charges"("roadLiabilityId");
CREATE UNIQUE INDEX IF NOT EXISTS "road_liability_customer_charges_reconciliationLineId_key" ON "road_liability_customer_charges"("reconciliationLineId");
CREATE INDEX IF NOT EXISTS "road_liability_customer_charges_contractId_idx" ON "road_liability_customer_charges"("contractId");
CREATE UNIQUE INDEX IF NOT EXISTS "contract_post_close_receivables_customerChargeId_key" ON "contract_post_close_receivables"("customerChargeId");
CREATE UNIQUE INDEX IF NOT EXISTS "contract_post_close_receivables_roadLiabilityId_key" ON "contract_post_close_receivables"("roadLiabilityId");
CREATE INDEX IF NOT EXISTS "contract_post_close_receivables_contractId_status_idx" ON "contract_post_close_receivables"("contractId", "status");

DO $$ BEGIN
    ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_roadLiabilityId_fkey" FOREIGN KEY ("roadLiabilityId") REFERENCES "road_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_reconciliationLineId_fkey" FOREIGN KEY ("reconciliationLineId") REFERENCES "contract_reconciliation_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "contract_post_close_receivables" ADD CONSTRAINT "contract_post_close_receivables_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "contract_post_close_receivables" ADD CONSTRAINT "contract_post_close_receivables_customerChargeId_fkey" FOREIGN KEY ("customerChargeId") REFERENCES "road_liability_customer_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "contract_post_close_receivables" ADD CONSTRAINT "contract_post_close_receivables_roadLiabilityId_fkey" FOREIGN KEY ("roadLiabilityId") REFERENCES "road_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "road_liability_customer_charges" (
    "id",
    "roadLiabilityId",
    "contractId",
    "destinationType",
    "officialAmountSnapshot",
    "customerChargeAmount",
    "adjustmentAmount",
    "adjustmentReason",
    "adjustmentNote",
    "confirmedByUserId",
    "confirmedAt",
    "reconciliationLineId",
    "createdAt"
)
SELECT
    gen_random_uuid()::text,
    l."roadLiabilityId",
    r."contractId",
    'RECONCILIATION',
    COALESCE(l."officialAmountSnapshot", l."amount"),
    l."amount",
    COALESCE(l."adjustmentAmount", 0),
    l."adjustmentReason",
    l."adjustmentNote",
    l."confirmedByUserId",
    COALESCE(l."confirmedAt", l."createdAt"),
    l."id",
    l."createdAt"
FROM "contract_reconciliation_lines" l
JOIN "contract_reconciliations" r ON r."id" = l."reconciliationId"
WHERE l."roadLiabilityId" IS NOT NULL
ON CONFLICT ("roadLiabilityId") DO NOTHING;
