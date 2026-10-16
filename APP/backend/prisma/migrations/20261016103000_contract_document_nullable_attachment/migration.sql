-- Allow superseded contract documents to detach from purged image bytes while keeping history.
ALTER TABLE "contract_documents" ALTER COLUMN "attachmentId" DROP NOT NULL;
