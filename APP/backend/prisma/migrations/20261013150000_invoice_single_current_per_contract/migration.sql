-- One CURRENT invoice per contract (partial unique) + legacy backfill.

-- Keep the newest revision (or latest issued) as the sole CURRENT row per contract.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "contractId"
      ORDER BY "revisionNumber" DESC, "issuedAt" DESC, "createdAt" DESC
    ) AS rn
  FROM "invoices"
)
UPDATE "invoices" AS i
SET "isCurrent" = false
FROM ranked AS r
WHERE i.id = r.id
  AND r.rn > 1
  AND i."isCurrent" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_contractId_one_current_idx"
  ON "invoices" ("contractId")
  WHERE "isCurrent" = true;
