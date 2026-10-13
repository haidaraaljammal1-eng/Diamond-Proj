-- Unified contract invoice revisions (additive; preserves existing invoice rows).

ALTER TABLE "invoices" ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "invoices" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "invoices" ADD COLUMN "supersedesInvoiceId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "contentFingerprint" TEXT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_supersedesInvoiceId_fkey"
  FOREIGN KEY ("supersedesInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoices_contractId_isCurrent_idx" ON "invoices"("contractId", "isCurrent");

DROP INDEX IF EXISTS "invoice_lines_sourceType_sourceId_key";
CREATE UNIQUE INDEX "invoice_lines_invoiceId_sourceType_sourceId_key"
  ON "invoice_lines"("invoiceId", "sourceType", "sourceId");
