-- Staff manual road liability provenance (returned-contract charges).
CREATE TYPE "StaffRoadChargeCategory" AS ENUM ('TRAFFIC_VIOLATION', 'SALIK');

ALTER TABLE "road_liabilities"
  ADD COLUMN "staffEnteredByUserId" INTEGER,
  ADD COLUMN "staffEnteredAt" TIMESTAMP(3),
  ADD COLUMN "staffChargeCategory" "StaffRoadChargeCategory",
  ADD COLUMN "staffChargeDescription" TEXT;

ALTER TABLE "road_liabilities"
  ADD CONSTRAINT "road_liabilities_staffEnteredByUserId_fkey"
  FOREIGN KEY ("staffEnteredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "road_liabilities_staffEnteredAt_idx" ON "road_liabilities"("staffEnteredAt");
