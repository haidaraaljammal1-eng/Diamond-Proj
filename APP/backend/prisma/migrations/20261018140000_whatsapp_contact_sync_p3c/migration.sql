-- CreateTable
CREATE TABLE "whatsapp_contact_profiles" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerContactId" TEXT NOT NULL,
    "whapiDisplayName" TEXT,
    "hasProfilePicture" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contact_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_contact_sync_states" (
    "connectionId" TEXT NOT NULL,
    "contactsOffset" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contact_sync_states_pkey" PRIMARY KEY ("connectionId")
);

-- CreateIndex
CREATE INDEX "whatsapp_contact_profiles_connectionId_idx" ON "whatsapp_contact_profiles"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contact_profiles_connectionId_providerContactId_key" ON "whatsapp_contact_profiles"("connectionId", "providerContactId");

-- AddForeignKey
ALTER TABLE "whatsapp_contact_profiles" ADD CONSTRAINT "whatsapp_contact_profiles_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_contact_sync_states" ADD CONSTRAINT "whatsapp_contact_sync_states_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
