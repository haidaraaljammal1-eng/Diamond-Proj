-- Structured rental duration (durationValue + durationUnit) alongside legacy rentalDays calendar field.

CREATE TYPE "ContractDurationUnit" AS ENUM ('HOUR', 'DAY', 'WEEK', 'MONTH');

ALTER TABLE "contracts"
  ADD COLUMN "durationValue" INTEGER,
  ADD COLUMN "durationUnit" "ContractDurationUnit";

-- Backfill existing contracts: duration mirrors rentalDays as whole days.
UPDATE "contracts"
SET
  "durationValue" = "rentalDays",
  "durationUnit" = 'DAY'::"ContractDurationUnit"
WHERE "durationValue" IS NULL;

ALTER TABLE "contracts"
  ALTER COLUMN "durationValue" SET NOT NULL,
  ALTER COLUMN "durationUnit" SET NOT NULL;
