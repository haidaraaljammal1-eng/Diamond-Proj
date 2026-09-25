-- Vehicle default rates: persist hourly + weekly alongside daily/monthly.
ALTER TABLE "vehicles" ADD COLUMN "hourlyRate" INTEGER,
ADD COLUMN "weeklyRate" INTEGER;

UPDATE "vehicles"
SET "hourlyRate" = ROUND("dailyRate" / 8.0)
WHERE "dailyRate" IS NOT NULL AND "hourlyRate" IS NULL;

UPDATE "vehicles"
SET "weeklyRate" = ROUND("dailyRate" * 7 * 0.88)
WHERE "dailyRate" IS NOT NULL AND "weeklyRate" IS NULL;

-- Offer pricing: hourly rentals as a first-class price type.
ALTER TYPE "ContractPriceType" ADD VALUE 'HOURLY';
