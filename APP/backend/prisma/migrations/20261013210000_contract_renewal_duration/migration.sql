-- Structured renewal duration (hour/day) without changing legacy additionalDays semantics for rental-day increment.
ALTER TABLE "contract_renewals"
ADD COLUMN "additionalDurationValue" INTEGER,
ADD COLUMN "additionalDurationUnit" "ContractDurationUnit";

UPDATE "contract_renewals"
SET
  "additionalDurationValue" = "additionalDays",
  "additionalDurationUnit" = 'DAY'
WHERE "additionalDurationValue" IS NULL;

ALTER TABLE "contract_renewals"
ALTER COLUMN "additionalDurationValue" SET NOT NULL,
ALTER COLUMN "additionalDurationUnit" SET NOT NULL,
ALTER COLUMN "additionalDurationUnit" SET DEFAULT 'DAY';
