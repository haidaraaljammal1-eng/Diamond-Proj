-- CreateEnum
CREATE TYPE "WhatsAppHistorySyncMode" AS ENUM ('FULL', 'INCREMENTAL');

-- AlterTable
ALTER TABLE "whatsapp_history_sync_runs" ADD COLUMN     "mode" "WhatsAppHistorySyncMode" NOT NULL DEFAULT 'FULL',
ADD COLUMN     "chatsSkipped" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skippedChats" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "completedWithSkips" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "whatsapp_connection_chat_sync_checkpoints" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerChatId" TEXT NOT NULL,
    "lastSyncedOccurredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_connection_chat_sync_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_connection_chat_sync_checkpoints_connectionId_idx" ON "whatsapp_connection_chat_sync_checkpoints"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connection_chat_sync_checkpoints_connectionId_providerChatId_key" ON "whatsapp_connection_chat_sync_checkpoints"("connectionId", "providerChatId");

-- AddForeignKey
ALTER TABLE "whatsapp_connection_chat_sync_checkpoints" ADD CONSTRAINT "whatsapp_connection_chat_sync_checkpoints_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
