import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatFinanceAed, formatOperationalLedgerAmount, formatSignedFinanceAed } from "./format-finance-money.ts";

describe("formatFinanceAed", () => {
  it("formats whole AED without decimals", () => {
    assert.equal(formatFinanceAed(12450), "AED 12,450");
  });
});

describe("formatSignedFinanceAed", () => {
  it("prefixes collection and expense directions", () => {
    assert.equal(formatSignedFinanceAed(1500, "COLLECTION"), "+ AED 1,500");
    assert.equal(formatSignedFinanceAed(850, "EXPENSE"), "- AED 850");
    assert.equal(formatSignedFinanceAed(100, "EXPENSE_REVERSAL"), "+ AED 100");
  });
});

describe("formatOperationalLedgerAmount", () => {
  it("shows a voided Manual Expense as unsigned AED, not +AED or -AED", () => {
    assert.equal(
      formatOperationalLedgerAmount(100, {
        kind: "MANUAL_EXPENSE",
        direction: "EXPENSE",
        manualExpenseStatus: "VOID",
      }),
      "AED 100",
    );
    assert.equal(
      formatOperationalLedgerAmount(100, {
        kind: "MANUAL_EXPENSE",
        direction: "EXPENSE",
        manualExpenseStatus: "ACTIVE",
      }),
      "- AED 100",
    );
  });
});
