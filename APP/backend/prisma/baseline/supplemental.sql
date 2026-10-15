-- Objects the Prisma schema cannot represent.
-- Applied only by scripts/fresh-database-baseline.mjs on an allowlisted empty database.
-- Historical migration files are not modified.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- At most one office connection that is not DISCONNECTED.
-- Indexed expression is the constant 1, so this is not a per-status unique.
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_connections_one_current"
ON "whatsapp_connections" ((1))
WHERE "status" IN ('LINKED', 'LINKING', 'REAUTH_REQUIRED', 'ERROR');

-- Prisma partial indexes accept equality filters only, not an IN list.
CREATE UNIQUE INDEX IF NOT EXISTS "contract_payment_attempts_one_active_per_payment_idx"
ON "contract_payment_attempts" ("contractPaymentId")
WHERE "status" IN ('PREPARING', 'RECOVERING', 'READY');
