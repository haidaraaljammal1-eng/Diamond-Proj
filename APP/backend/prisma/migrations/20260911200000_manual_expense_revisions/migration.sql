-- CreateTable
CREATE TABLE "manual_expense_revisions" (
    "id" TEXT NOT NULL,
    "manualExpenseId" TEXT NOT NULL,
    "changedByUserId" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB NOT NULL,

    CONSTRAINT "manual_expense_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_expense_revisions_manualExpenseId_changedAt_idx" ON "manual_expense_revisions"("manualExpenseId", "changedAt");

-- CreateIndex
CREATE INDEX "manual_expense_revisions_changedByUserId_idx" ON "manual_expense_revisions"("changedByUserId");

-- AddForeignKey
ALTER TABLE "manual_expense_revisions" ADD CONSTRAINT "manual_expense_revisions_manualExpenseId_fkey" FOREIGN KEY ("manualExpenseId") REFERENCES "manual_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expense_revisions" ADD CONSTRAINT "manual_expense_revisions_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
