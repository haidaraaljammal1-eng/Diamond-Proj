-- CreateEnum
CREATE TYPE "WhatsAppMessageSendState" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN "sentByUserId" INTEGER;
ALTER TABLE "whatsapp_messages" ADD COLUMN "sendState" "WhatsAppMessageSendState";

-- CreateTable
CREATE TABLE "whatsapp_outbound_attempts" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "state" "WhatsAppMessageSendState" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "safeProviderErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_outbound_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_outbound_attempts_messageId_key" ON "whatsapp_outbound_attempts"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_outbound_attempts_actorUserId_idempotencyKeyHash_key" ON "whatsapp_outbound_attempts"("actorUserId", "idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "whatsapp_outbound_attempts_conversationId_createdAt_idx" ON "whatsapp_outbound_attempts"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_outbound_attempts" ADD CONSTRAINT "whatsapp_outbound_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "whatsapp_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_outbound_attempts" ADD CONSTRAINT "whatsapp_outbound_attempts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_outbound_attempts" ADD CONSTRAINT "whatsapp_outbound_attempts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_outbound_attempts" ADD CONSTRAINT "whatsapp_outbound_attempts_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
