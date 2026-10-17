-- CreateEnum
CREATE TYPE "WhatsAppHistorySyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WhatsAppHistorySyncPhase" AS ENUM ('CHATS', 'MESSAGES', 'DONE');

-- CreateTable
CREATE TABLE "whatsapp_history_sync_runs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "WhatsAppHistorySyncStatus" NOT NULL DEFAULT 'QUEUED',
    "phase" "WhatsAppHistorySyncPhase" NOT NULL DEFAULT 'CHATS',
    "chatsOffset" INTEGER NOT NULL DEFAULT 0,
    "chatQueueIndex" INTEGER NOT NULL DEFAULT 0,
    "messagesOffset" INTEGER NOT NULL DEFAULT 0,
    "chatQueue" JSONB NOT NULL DEFAULT '[]',
    "chatsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "chatsCompleted" INTEGER NOT NULL DEFAULT 0,
    "messagesImported" INTEGER NOT NULL DEFAULT 0,
    "messagesSkipped" INTEGER NOT NULL DEFAULT 0,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "lastErrorCode" TEXT,
    "queuedByUserId" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_history_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_history_sync_runs_connectionId_status_idx" ON "whatsapp_history_sync_runs"("connectionId", "status");

-- CreateIndex
CREATE INDEX "whatsapp_history_sync_runs_connectionId_createdAt_idx" ON "whatsapp_history_sync_runs"("connectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_history_sync_runs" ADD CONSTRAINT "whatsapp_history_sync_runs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_history_sync_runs" ADD CONSTRAINT "whatsapp_history_sync_runs_queuedByUserId_fkey" FOREIGN KEY ("queuedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
