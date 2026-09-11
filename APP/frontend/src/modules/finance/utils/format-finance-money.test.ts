import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatFinanceAed, formatSignedFinanceAed } from "./format-finance-money.ts";

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
