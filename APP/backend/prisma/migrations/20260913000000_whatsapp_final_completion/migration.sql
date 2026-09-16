-- AlterEnum
ALTER TYPE "WhatsAppMessageType" ADD VALUE 'TEMPLATE';

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN "customerId" INTEGER;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "customerLinkedAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_conversations" ADD COLUMN "customerLinkedByUserId" INTEGER;

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN "caption" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "mediaMimeType" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "mediaFilename" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "mediaSizeBytes" INTEGER;
ALTER TABLE "whatsapp_messages" ADD COLUMN "templateName" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "templateLanguage" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "templatePreview" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "displayPayload" JSONB;

-- CreateIndex
CREATE INDEX "whatsapp_conversations_customerId_idx" ON "whatsapp_conversations"("customerId");

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customerLinkedByUserId_fkey" FOREIGN KEY ("customerLinkedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
