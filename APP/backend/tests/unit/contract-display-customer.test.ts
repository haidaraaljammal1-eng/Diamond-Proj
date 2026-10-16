import assert from "node:assert/strict";
import { test } from "node:test";
import {
  customerNameFromContractSnapshot,
  resolveContractDisplayCustomerName,
} from "src/modules/contracts/contract-display-customer";

test("resolveContractDisplayCustomerName prefers contract snapshot over linked customer", () => {
  const snapshot = {
    contractNumber: "DE-1",
    customer: { name: "Contract A", mobile: "0500000000" },
  };
  assert.equal(resolveContractDisplayCustomerName(snapshot, "Global Master"), "Contract A");
  assert.equal(customerNameFromContractSnapshot(snapshot), "Contract A");
});

test("resolveContractDisplayCustomerName falls back to linked customer without snapshot", () => {
  assert.equal(resolveContractDisplayCustomerName(null, "Legacy Linked"), "Legacy Linked");
  assert.equal(resolveContractDisplayCustomerName({}, null), null);
});
