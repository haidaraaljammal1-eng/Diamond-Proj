-- Finance company classification (Phase C1).
--
-- Finance learns UNIQUE / ELITE / GENERAL. GENERAL is NOT an OperatingCompany:
-- it is `companyId IS NULL`, used for a financial record that has no authoritative
-- company-bearing business record behind it (office rent, marketing, a government
-- fee booked without a Vehicle).
--
-- Both columns are NULLABLE and stay nullable. Nothing in this migration creates
-- an operating company, and nothing falls back to UNIQUE: an unresolvable row is
-- left null rather than silently classified.
--
-- Backfill is deterministic and relation-only. No description parsing, no category
-- name guessing.

-- ---------------------------------------------------------------------------
-- 1. Columns (nullable)
-- ---------------------------------------------------------------------------

ALTER TABLE "manual_expenses" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "financial_ledger_entries" ADD COLUMN "companyId" INTEGER;

-- ---------------------------------------------------------------------------
-- 2. Manual Expense backfill — the optional Vehicle is the only source.
--    A Vehicle's company is write-once, so the relation is permanently correct.
--    A vehicle-less expense is GENERAL and deliberately stays NULL.
-- ---------------------------------------------------------------------------

UPDATE "manual_expenses" AS me
SET "companyId" = v."companyId"
FROM "vehicles" AS v
WHERE me."vehicleId" = v."id" AND me."companyId" IS NULL;

-- Guard: every vehicle-linked expense must now carry that vehicle's company.
DO $$
DECLARE unresolved INTEGER;
BEGIN
    SELECT COUNT(*) INTO unresolved
    FROM "manual_expenses"
    WHERE "vehicleId" IS NOT NULL AND "companyId" IS NULL;
    IF unresolved > 0 THEN
        RAISE EXCEPTION 'finance_company_classification: % vehicle-linked manual expense(s) without a company', unresolved;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Ledger backfill — authoritative precedence, strongest source first.
-- ---------------------------------------------------------------------------

-- A. Contract-based entries: the Contract's FROZEN company, never the Vehicle's
--    current owner. This is what protects historical financial rows.
UPDATE "financial_ledger_entries" AS fle
SET "companyId" = c."companyId"
FROM "contracts" AS c
WHERE fle."contractId" = c."id" AND fle."companyId" IS NULL;

-- B. Manual Expense entries: the expense's own classification, which is NULL for
--    a GENERAL expense. Applied before the Vehicle fallback so a GENERAL expense
--    can never pick up a company from anywhere else.
UPDATE "financial_ledger_entries" AS fle
SET "companyId" = me."companyId"
FROM "manual_expenses" AS me
WHERE fle."manualExpenseId" = me."id"
  AND fle."companyId" IS NULL
  AND me."companyId" IS NOT NULL;

-- C. Maintenance entries: MaintenanceOrder has no company of its own; it derives
--    from its Vehicle (Phase A decision, unchanged here).
UPDATE "financial_ledger_entries" AS fle
SET "companyId" = v."companyId"
FROM "maintenance_orders" AS mo
JOIN "vehicles" AS v ON v."id" = mo."vehicleId"
WHERE fle."maintenanceOrderId" = mo."id"
  AND fle."companyId" IS NULL
  AND fle."manualExpenseId" IS NULL;

-- D. Remaining vehicle-referencing entries with no stronger source.
UPDATE "financial_ledger_entries" AS fle
SET "companyId" = v."companyId"
FROM "vehicles" AS v
WHERE fle."vehicleId" = v."id"
  AND fle."companyId" IS NULL
  AND fle."manualExpenseId" IS NULL;

-- E. Anything still unresolved keeps `companyId = NULL`. That is the correct
--    answer, not a defect: there is no authoritative company behind it.

-- Guard: a ledger row must never disagree with the Contract it belongs to.
DO $$
DECLARE mismatched INTEGER;
BEGIN
    SELECT COUNT(*) INTO mismatched
    FROM "financial_ledger_entries" AS fle
    JOIN "contracts" AS c ON c."id" = fle."contractId"
    WHERE fle."companyId" IS DISTINCT FROM c."companyId";
    IF mismatched > 0 THEN
        RAISE EXCEPTION 'finance_company_classification: % ledger row(s) disagree with their contract company', mismatched;
    END IF;
END $$;

-- Guard: a ledger row must never disagree with the Manual Expense it projects.
DO $$
DECLARE mismatched INTEGER;
BEGIN
    SELECT COUNT(*) INTO mismatched
    FROM "financial_ledger_entries" AS fle
    JOIN "manual_expenses" AS me ON me."id" = fle."manualExpenseId"
    WHERE fle."companyId" IS DISTINCT FROM me."companyId";
    IF mismatched > 0 THEN
        RAISE EXCEPTION 'finance_company_classification: % ledger row(s) disagree with their manual expense company', mismatched;
    END IF;
END $$;

-- Guard: this phase introduces no third company.
DO $$
DECLARE extra INTEGER;
BEGIN
    SELECT COUNT(*) INTO extra
    FROM "operating_companies"
    WHERE "code" NOT IN ('UNIQUE', 'ELITE');
    IF extra > 0 THEN
        RAISE EXCEPTION 'finance_company_classification: % unexpected operating company row(s) — GENERAL is NULL, not a company', extra;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Indexes and foreign keys
-- ---------------------------------------------------------------------------

CREATE INDEX "manual_expenses_companyId_idx" ON "manual_expenses"("companyId");

-- Company-scoped Finance aggregates filter company + period together; the leading
-- column also serves a plain companyId lookup, so no separate index is added.
CREATE INDEX "financial_ledger_entries_companyId_occurredAt_idx" ON "financial_ledger_entries"("companyId", "occurredAt");

-- RESTRICT: an operating company is master data, deactivated but never deleted
-- out from under financial history.
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
