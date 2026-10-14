-- Archive pull-sync: contract link + sync cursor state
ALTER TABLE "archive_rows" ADD COLUMN "contractId" TEXT;

CREATE UNIQUE INDEX "archive_rows_contractId_key" ON "archive_rows"("contractId");

ALTER TABLE "archive_rows" ADD CONSTRAINT "archive_rows_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "archive_sync_state" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "runningStartedAt" TIMESTAMP(3),
    "runningByUserId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_sync_state_pkey" PRIMARY KEY ("id")
);

INSERT INTO "archive_sync_state" ("id", "updatedAt") VALUES ('global', CURRENT_TIMESTAMP);
