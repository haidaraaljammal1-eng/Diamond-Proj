import { test } from "node:test";
import assert from "node:assert/strict";
import { ledgerDirection } from "src/modules/finance/finance.mapper";

test("ledgerDirection treats ROAD_LIABILITY_PAYMENT as COLLECTION", () => {
  assert.equal(ledgerDirection("ROAD_LIABILITY_PAYMENT"), "COLLECTION");
});

test("ledgerDirection classifies expense kinds", () => {
  assert.equal(ledgerDirection("MAINTENANCE_EXPENSE"), "EXPENSE");
  assert.equal(ledgerDirection("MANUAL_EXPENSE_REVERSAL"), "EXPENSE_REVERSAL");
});
