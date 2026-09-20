-- Multi-company foundation: Diamond operates UNIQUE and ELITE over one fleet and
-- one workflow. This migration introduces the company entity and the two owning
-- references only. It changes no lifecycle value, no contract number, no snapshot.
--
-- Deterministic and self-sufficient: the two company rows are inserted here, so
-- the backfill never depends on a seed having run first. `prisma/seed/index.ts`
-- upserts the same rows by `code` afterwards and converges on them.

-- CreateTable
CREATE TABLE "operating_companies" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "legalNameAr" TEXT NOT NULL,
    "legalNameEn" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operating_companies_code_key" ON "operating_companies"("code");

-- CreateIndex
CREATE INDEX "operating_companies_isActive_idx" ON "operating_companies"("isActive");

-- Seed the two operating companies (idempotent on `code`).
INSERT INTO "operating_companies" ("code", "displayName", "legalNameAr", "legalNameEn", "accentColor", "isActive", "createdAt", "updatedAt")
VALUES
    ('UNIQUE', 'UNIQUE', 'شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و', 'DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C', '#C9A15C', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ELITE', 'ELITE', 'شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و', 'DIAMOND ELITE CAR RENTALS CO. LLC S.O.C', '#3E5C76', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- AlterTable: nullable first so existing rows survive the column add.
ALTER TABLE "vehicles" ADD COLUMN "companyId" INTEGER;

-- Backfill: the whole pre-existing fleet, active and retired alike, belongs to UNIQUE.
UPDATE "vehicles"
SET "companyId" = (SELECT "id" FROM "operating_companies" WHERE "code" = 'UNIQUE')
WHERE "companyId" IS NULL;

-- Guard: refuse to continue if any vehicle is still unassigned.
DO $$
DECLARE unassigned INTEGER;
BEGIN
    SELECT COUNT(*) INTO unassigned FROM "vehicles" WHERE "companyId" IS NULL;
    IF unassigned > 0 THEN
        RAISE EXCEPTION 'multi_company_foundation: % vehicle(s) without a company', unassigned;
    END IF;
END $$;

ALTER TABLE "vehicles" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable: same sequence for the Contract's historical company.
ALTER TABLE "contracts" ADD COLUMN "companyId" INTEGER;

-- Backfill from the authoritative Vehicle relation, not from a literal: the
-- Contract's company is the company that owned its Vehicle at this point in time.
UPDATE "contracts" AS c
SET "companyId" = v."companyId"
FROM "vehicles" AS v
WHERE c."vehicleId" = v."id" AND c."companyId" IS NULL;

-- Guard: refuse to continue if any contract is still unassigned.
DO $$
DECLARE unassigned INTEGER;
BEGIN
    SELECT COUNT(*) INTO unassigned FROM "contracts" WHERE "companyId" IS NULL;
    IF unassigned > 0 THEN
        RAISE EXCEPTION 'multi_company_foundation: % contract(s) without a company', unassigned;
    END IF;
END $$;

ALTER TABLE "contracts" ALTER COLUMN "companyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "vehicles_companyId_idx" ON "vehicles"("companyId");

-- CreateIndex
CREATE INDEX "contracts_companyId_idx" ON "contracts"("companyId");

-- AddForeignKey: RESTRICT — an operating company is master data and is
-- deactivated (isActive=false), never deleted out from under its history.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
