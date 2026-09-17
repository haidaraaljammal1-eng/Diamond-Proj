-- CreateTable
CREATE TABLE "contract_card_payment_methods" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "stripeCustomerId" TEXT,
    "stripePaymentMethodId" TEXT NOT NULL,
    "cardBrand" TEXT NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_card_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_card_payment_methods_contractId_key" ON "contract_card_payment_methods"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_card_payment_methods_stripePaymentMethodId_key" ON "contract_card_payment_methods"("stripePaymentMethodId");

-- AddForeignKey
ALTER TABLE "contract_card_payment_methods" ADD CONSTRAINT "contract_card_payment_methods_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
