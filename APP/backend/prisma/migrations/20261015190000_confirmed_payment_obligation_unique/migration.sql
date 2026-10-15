-- Fresh baselines seal historical SQL without replaying it, so this guard
-- must be created again. Databases that already applied the historical
-- migration already have the index; IF NOT EXISTS makes deploy idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS "contract_payments_confirmed_obligation_idx"
  ON "contract_payments"("purpose", "targetId")
  WHERE "status" = 'CONFIRMED';

CREATE UNIQUE INDEX IF NOT EXISTS "contract_payments_provider_reference_idx"
  ON "contract_payments"("provider", "providerReference")
  WHERE "providerReference" IS NOT NULL;
