-- Persist the authenticated staff member who completed Car-In (nullable for historical rows).
ALTER TABLE "contract_car_ins" ADD COLUMN "performedByUserId" INTEGER;

ALTER TABLE "contract_car_ins" ADD CONSTRAINT "contract_car_ins_performedByUserId_fkey"
  FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "contract_car_ins_performedByUserId_idx" ON "contract_car_ins"("performedByUserId");
