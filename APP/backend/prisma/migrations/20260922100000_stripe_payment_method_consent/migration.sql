-- STRIPE-3: Diamond Customer → Stripe Customer mapping and payment-method consent audit.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_stripeCustomerId_key" ON "customers"("stripeCustomerId");

ALTER TABLE "contract_payments" ADD COLUMN IF NOT EXISTS "savePaymentMethodForFutureUse" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contract_payments" ADD COLUMN IF NOT EXISTS "futureUseConsentAt" TIMESTAMP(3);
ALTER TABLE "contract_payments" ADD COLUMN IF NOT EXISTS "futureUseConsentVersion" TEXT;
ALTER TABLE "contract_payments" ADD COLUMN IF NOT EXISTS "futureUseConsentLocale" TEXT;

ALTER TABLE "contract_card_payment_methods" ADD COLUMN IF NOT EXISTS "futureUseConsentPaymentId" TEXT;
ALTER TABLE "contract_card_payment_methods" ADD COLUMN IF NOT EXISTS "futureUseAuthorizedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "contract_card_payment_methods_futureUseConsentPaymentId_key"
  ON "contract_card_payment_methods"("futureUseConsentPaymentId");

-- Backfill Stripe Customer ids from existing per-contract card rows when possible.
UPDATE "customers" c
SET "stripeCustomerId" = sub."stripeCustomerId"
FROM (
  SELECT DISTINCT ON (ct."customerId") ct."customerId", ccpm."stripeCustomerId"
  FROM "contracts" ct
  INNER JOIN "contract_card_payment_methods" ccpm ON ccpm."contractId" = ct."id"
  WHERE ccpm."stripeCustomerId" IS NOT NULL
  ORDER BY ct."customerId", ccpm."updatedAt" DESC
) sub
WHERE c."id" = sub."customerId"
  AND c."stripeCustomerId" IS NULL;
