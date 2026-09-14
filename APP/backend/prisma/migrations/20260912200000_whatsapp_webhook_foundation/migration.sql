-- CreateEnum
CREATE TYPE "WhatsAppConnectionWebhookStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING', 'ACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "WhatsAppWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppWebhookEventType" AS ENUM ('MESSAGE_RECEIVED', 'MESSAGE_STATUS', 'TEMPLATE_STATUS', 'ACCOUNT_EVENT', 'PHONE_EVENT', 'UNKNOWN');

-- AlterTable
ALTER TABLE "whatsapp_connections"
  ADD COLUMN "webhookStatus" "WhatsAppConnectionWebhookStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN "lastWebhookAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "whatsapp_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META_CLOUD_API',
    "providerEventKey" TEXT NOT NULL,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "eventType" "WhatsAppWebhookEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" "WhatsAppWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "failureCode" TEXT,
    "connectionId" TEXT,
    "providerMessageId" TEXT,
    "customerWaId" TEXT,
    "customerDisplayName" TEXT,
    "occurredAt" TIMESTAMP(3),
    "messageType" TEXT,
    "textBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_webhook_events_providerEventKey_key" ON "whatsapp_webhook_events"("providerEventKey");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_connectionId_receivedAt_idx" ON "whatsapp_webhook_events"("connectionId", "receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_status_receivedAt_idx" ON "whatsapp_webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_wabaId_phoneNumberId_idx" ON "whatsapp_webhook_events"("wabaId", "phoneNumberId");

-- AddForeignKey
ALTER TABLE "whatsapp_webhook_events" ADD CONSTRAINT "whatsapp_webhook_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
