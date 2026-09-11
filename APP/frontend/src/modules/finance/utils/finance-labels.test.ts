import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expenseCategoryLabel,
  ledgerMovementLabel,
  receivableSourceLabel,
} from "./finance-labels.ts";

const t = (key: string) => key;

describe("finance labels", () => {
  it("maps receivable source types", () => {
    assert.equal(receivableSourceLabel("RENTAL", t), "receivableSource.RENTAL");
    assert.equal(receivableSourceLabel("POST_CLOSE_RECEIVABLE", t), "receivableSource.POST_CLOSE_RECEIVABLE");
  });

  it("maps ledger movement directions without income wording", () => {
    assert.equal(ledgerMovementLabel("EXPENSE_REVERSAL", t), "ledgerMovement.EXPENSE_REVERSAL");
    assert.notEqual(ledgerMovementLabel("EXPENSE_REVERSAL", t), "Income");
  });

  it("maps manual expense categories", () => {
    const translate = (key: string) =>
      key === "expenseCategory.VEHICLE_CLEANING" ? "Vehicle Cleaning" : key;
    assert.equal(expenseCategoryLabel("VEHICLE_CLEANING", translate), "Vehicle Cleaning");
  });
});
