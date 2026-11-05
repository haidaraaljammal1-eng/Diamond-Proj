import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listContractDeferredReconciliationCharges } from "src/modules/contracts/contracts-deferred-reconciliation-charges";

describe("contracts-deferred-reconciliation-charges", () => {
  test("module exports list helper", () => {
    assert.equal(typeof listContractDeferredReconciliationCharges, "function");
  });
});
