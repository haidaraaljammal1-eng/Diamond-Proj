-- Vehicle.externalId becomes unique WITHIN an operating company.
--
-- UNIQUE and ELITE integrate with separate external systems and may legitimately
-- reuse the same id in their own namespaces. plateNumber and vin stay GLOBALLY
-- unique: a plate or a chassis belongs to one physical car whichever company owns it.
--
-- Postgres treats NULLs as distinct, so vehicles without an externalId are
-- unaffected and any number of them may coexist in one company.

-- DropIndex
DROP INDEX "vehicles_externalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_companyId_externalId_key" ON "vehicles"("companyId", "externalId");
