-- AlterEnum
ALTER TYPE "WhatsAppProvider" ADD VALUE 'ULTRAMSG';

-- CreateEnum
CREATE TYPE "WhatsAppProviderSessionStatus" AS ENUM (
  'INITIALIZING',
  'QR_REQUIRED',
  'RETRYING',
  'LOADING',
  'AUTHENTICATED',
  'DISCONNECTED',
  'STANDBY',
  'UNKNOWN'
);

-- AlterTable
ALTER TABLE "whatsapp_connections" ADD COLUMN "providerInstanceId" TEXT;
ALTER TABLE "whatsapp_connections" ADD COLUMN "providerApiUrl" TEXT;
ALTER TABLE "whatsapp_connections" ADD COLUMN "providerSessionStatus" "WhatsAppProviderSessionStatus";
ALTER TABLE "whatsapp_connections" ADD COLUMN "providerSessionCheckedAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_connections" ADD COLUMN "webhookCallbackCiphertext" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN "providerChatId" TEXT;

-- CreateIndex
CREATE INDEX "whatsapp_conversations_connectionId_providerChatId_idx" ON "whatsapp_conversations"("connectionId", "providerChatId");
