-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('META_CLOUD_API');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'LINKING', 'LINKED', 'REAUTH_REQUIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionAttemptStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'SELECTED', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META_CLOUD_API',
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "businessAccountName" TEXT,
    "credentialCiphertext" TEXT,
    "credentialExpiresAt" TIMESTAMP(3),
    "connectedByUserId" INTEGER,
    "connectedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "disconnectedByUserId" INTEGER,
    "lastProviderErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_connection_attempts" (
    "id" TEXT NOT NULL,
    "initiatedByUserId" INTEGER NOT NULL,
    "status" "WhatsAppConnectionAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "stateNonceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "temporaryCredentialCiphertext" TEXT,
    "temporaryCredentialExpiresAt" TIMESTAMP(3),
    "providerGrantMetadata" JSONB,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connection_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_connections_status_idx" ON "whatsapp_connections"("status");

-- CreateIndex
CREATE INDEX "whatsapp_connections_wabaId_phoneNumberId_idx" ON "whatsapp_connections"("wabaId", "phoneNumberId");

-- One current office connection (V1). Historical DISCONNECTED rows may remain.
CREATE UNIQUE INDEX "whatsapp_connections_one_current"
ON "whatsapp_connections" ((1))
WHERE "status" IN ('LINKED', 'LINKING', 'REAUTH_REQUIRED', 'ERROR');

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connection_attempts_stateNonceHash_key" ON "whatsapp_connection_attempts"("stateNonceHash");

-- CreateIndex
CREATE INDEX "whatsapp_connection_attempts_initiatedByUserId_createdAt_idx" ON "whatsapp_connection_attempts"("initiatedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_connection_attempts_status_expiresAt_idx" ON "whatsapp_connection_attempts"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_disconnectedByUserId_fkey" FOREIGN KEY ("disconnectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connection_attempts" ADD CONSTRAINT "whatsapp_connection_attempts_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
