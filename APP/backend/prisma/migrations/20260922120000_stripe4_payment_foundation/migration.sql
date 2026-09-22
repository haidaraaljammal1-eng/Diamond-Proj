-- CreateEnum
CREATE TYPE "PaymentProviderKind" AS ENUM ('STRIPE');

-- CreateEnum
CREATE TYPE "CustomerPaymentMethodStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "StripeWebhookProcessingStatus" AS ENUM ('RECEIVED', 'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "customer_payment_profiles" (
    "id" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL DEFAULT 'STRIPE',
    "providerAccountKey" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "providerCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_payment_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payment_methods" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "providerPaymentMethodId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CARD',
    "cardBrand" TEXT NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "status" "CustomerPaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payment_authorizations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "customerPaymentMethodId" TEXT NOT NULL,
    "sourcePaymentId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentLocale" TEXT NOT NULL,
    "consentTextHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_payment_authorizations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "stripe_webhook_events" ADD COLUMN     "eventKind" TEXT,
ADD COLUMN     "processingStatus" "StripeWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "providerReference" TEXT,
ADD COLUMN     "normalizedStatus" TEXT,
ADD COLUMN     "amountMinor" INTEGER,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastErrorCode" TEXT;

-- CreateIndex
CREATE INDEX "customer_payment_profiles_providerCustomerId_idx" ON "customer_payment_profiles"("providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_profiles_customerId_provider_providerAccou_key" ON "customer_payment_profiles"("customerId", "provider", "providerAccountKey", "livemode");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_profiles_provider_providerAccountKey_livemod_key" ON "customer_payment_profiles"("provider", "providerAccountKey", "livemode", "providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_methods_profileId_providerPaymentMethodId_key" ON "customer_payment_methods"("profileId", "providerPaymentMethodId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_authorizations_contractId_key" ON "contract_payment_authorizations"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_authorizations_sourcePaymentId_key" ON "contract_payment_authorizations"("sourcePaymentId");

-- CreateIndex
CREATE INDEX "contract_payment_authorizations_customerId_idx" ON "contract_payment_authorizations"("customerId");

-- CreateIndex
CREATE INDEX "contract_payment_authorizations_customerPaymentMethodId_idx" ON "contract_payment_authorizations"("customerPaymentMethodId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_processingStatus_availableAt_idx" ON "stripe_webhook_events"("processingStatus", "availableAt");

-- CreateIndex
CREATE INDEX "customers_identityNumber_idx" ON "customers"("identityNumber");

-- CreateIndex
CREATE INDEX "customers_passportNumber_idx" ON "customers"("passportNumber");

-- CreateIndex
CREATE INDEX "customers_drivingLicenseNumber_idx" ON "customers"("drivingLicenseNumber");

-- AddForeignKey
ALTER TABLE "customer_payment_profiles" ADD CONSTRAINT "customer_payment_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_methods" ADD CONSTRAINT "customer_payment_methods_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "customer_payment_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_authorizations" ADD CONSTRAINT "contract_payment_authorizations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_authorizations" ADD CONSTRAINT "contract_payment_authorizations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_authorizations" ADD CONSTRAINT "contract_payment_authorizations_customerPaymentMethodId_fkey" FOREIGN KEY ("customerPaymentMethodId") REFERENCES "customer_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_authorizations" ADD CONSTRAINT "contract_payment_authorizations_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "contract_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
