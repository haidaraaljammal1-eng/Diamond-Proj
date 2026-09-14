-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'LOCATION', 'CONTACTS', 'INTERACTIVE', 'REACTION', 'STICKER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsAppMessageProviderStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "customerWaId" TEXT NOT NULL,
    "customerDisplayName" TEXT,
    "lastMessageId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastMessageType" "WhatsAppMessageType",
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "lastReadByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "messageType" "WhatsAppMessageType" NOT NULL,
    "textBody" TEXT,
    "providerMediaId" TEXT,
    "providerOccurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "providerStatus" "WhatsAppMessageProviderStatus",
    "webhookEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_connectionId_customerWaId_key" ON "whatsapp_conversations"("connectionId", "customerWaId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_lastMessageAt_idx" ON "whatsapp_conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_unreadCount_idx" ON "whatsapp_conversations"("unreadCount");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_customerDisplayName_idx" ON "whatsapp_conversations"("customerDisplayName");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_connectionId_providerMessageId_key" ON "whatsapp_messages"("connectionId", "providerMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_providerOccurredAt_idx" ON "whatsapp_messages"("conversationId", "providerOccurredAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_createdAt_idx" ON "whatsapp_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_lastReadByUserId_fkey" FOREIGN KEY ("lastReadByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_webhookEventId_fkey" FOREIGN KEY ("webhookEventId") REFERENCES "whatsapp_webhook_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (after messages exist — lastMessage points at a message row)
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_lastMessageId_fkey" FOREIGN KEY ("lastMessageId") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
