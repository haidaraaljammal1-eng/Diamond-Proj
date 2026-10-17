-- CreateEnum
CREATE TYPE "WhatsAppConversationKind" AS ENUM ('DIRECT', 'GROUP');

-- AlterEnum
ALTER TYPE "WhatsAppHistorySyncPhase" ADD VALUE 'GROUPS';

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN "kind" "WhatsAppConversationKind" NOT NULL DEFAULT 'DIRECT';

-- CreateTable
CREATE TABLE "whatsapp_group_profiles" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerGroupId" TEXT NOT NULL,
    "groupName" TEXT,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "hasIcon" BOOLEAN NOT NULL DEFAULT false,
    "participants" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_group_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_group_profiles_connectionId_providerGroupId_key" ON "whatsapp_group_profiles"("connectionId", "providerGroupId");
CREATE INDEX "whatsapp_group_profiles_connectionId_idx" ON "whatsapp_group_profiles"("connectionId");

ALTER TABLE "whatsapp_group_profiles" ADD CONSTRAINT "whatsapp_group_profiles_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
