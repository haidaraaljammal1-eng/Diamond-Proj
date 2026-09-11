import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8")) as {
  Finance: Record<string, unknown>;
};

describe("Finance KPI semantics", () => {
  it("uses approved KPI labels only", () => {
    const kpi = en.Finance.kpi as Record<string, string>;
    assert.equal(kpi.collected, "Collected");
    assert.equal(kpi.outstanding, "Outstanding");
    assert.equal(kpi.expenses, "Expenses");
    assert.equal(kpi.netMovement, "Net Movement");
  });

  it("does not label KPIs as revenue or profit", () => {
    const serialized = JSON.stringify(en.Finance.kpi);
    assert.equal(serialized.includes("Revenue"), false);
    assert.equal(serialized.includes("Profit"), false);
  });

  it("communicates outstanding as current balance", () => {
    const kpi = en.Finance.kpi as Record<string, string>;
    assert.match(kpi.outstandingCurrent, /current/i);
  });

  it("keeps Movement and Source labels distinct", () => {
    const finance = en.Finance as Record<string, Record<string, string>>;
    assert.equal(finance.ledgerMovement.COLLECTION, "Customer Collection");
    assert.equal(finance.ledgerMovement.EXPENSE, "Expense");
    assert.equal(finance.ledgerMovement.VOIDED, "Voided");
    assert.equal(finance.ledgerSource.RENTAL_PAYMENT, "Rental Payment");
    assert.equal(finance.ledgerSource.RECONCILIATION_PAYMENT, "Return Reconciliation");
    assert.equal(finance.ledgerSource.POST_CLOSE_RECEIVABLE_PAYMENT, "Post-Close Charge");
    assert.equal(finance.ledgerSource.MANUAL_EXPENSE, "Manual Expense");
    assert.equal(finance.ledgerKind.MANUAL_EXPENSE_REVERSAL, "Manual Expense");
    assert.equal(JSON.stringify(finance.ledgerSource).includes("Expense Reversal"), false);
    assert.equal(JSON.stringify(finance.ledgerSource).includes("Customer Collection"), false);
  });

  it("localizes receivable payment states without using KPI Outstanding wording", () => {
    const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const ar = JSON.parse(readFileSync(join(rootDir, "messages/ar.json"), "utf8")) as {
      Finance: { receivablePaymentState: Record<string, string>; kpi: Record<string, string> };
    };
    const states = en.Finance.receivablePaymentState as Record<string, string>;
    const arStates = ar.Finance.receivablePaymentState;
    assert.equal(states.UNPAID, "Awaiting Payment");
    assert.equal(arStates.UNPAID, "بانتظار الدفع");
    assert.deepEqual(Object.keys(states).sort(), Object.keys(arStates).sort());
    assert.equal((en.Finance.kpi as Record<string, string>).outstanding, "Outstanding");
    assert.equal(ar.Finance.kpi.outstanding, "مستحق التحصيل");
    for (const [key, label] of Object.entries(states)) {
      assert.notEqual(label, key);
      assert.notEqual(label, "Outstanding");
      assert.notEqual(arStates[key], key);
      assert.notEqual(arStates[key], "مستحق التحصيل");
    }
  });

  it("keeps correction history labels aligned in EN and AR", () => {
    const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const ar = JSON.parse(readFileSync(join(rootDir, "messages/ar.json"), "utf8")) as {
      Finance: { expense: Record<string, string>; errors: Record<string, string> };
    };
    const expense = en.Finance.expense as Record<string, string>;
    const arExpense = ar.Finance.expense;
    assert.equal(expense.correctAction, "Correct Expense");
    assert.equal(arExpense.correctAction, "تصحيح المصروف");
    assert.equal(expense.correctionHistory, "Correction History");
    assert.equal(arExpense.correctionHistory, "سجل التعديلات");
    assert.equal(expense.correctedBy, "Corrected by");
    assert.equal(arExpense.correctedBy, "تم التعديل بواسطة");
    assert.equal(expense.correctedAt, "Corrected at");
    assert.equal(arExpense.correctedAt, "تاريخ التعديل");
    assert.equal(expense.previousValue, "Previous value");
    assert.equal(arExpense.previousValue, "القيمة السابقة");
    assert.equal(expense.newValue, "New value");
    assert.equal(arExpense.newValue, "القيمة الجديدة");
    assert.equal(expense.statusVoid, "Voided");
    assert.equal(arExpense.statusVoid, "ملغى");
    const errors = en.Finance.errors as Record<string, string>;
    const arErrors = ar.Finance.errors;
    assert.deepEqual(Object.keys(errors).sort(), Object.keys(arErrors).sort());
    assert.equal(errors.FINANCE_EXPENSE_NO_CHANGES.includes("FINANCE_"), false);
  });
});
