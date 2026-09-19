import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ContractListItemDto } from "../types/contract.types";
import { getContractRowAction } from "./contract-row-action.ts";

function row(status: ContractListItemDto["status"], actions: Partial<ContractListItemDto["actions"]> = {}) {
  return { status, actions: { canCarOut: false, canCarIn: false, ...actions } };
}

describe("getContractRowAction", () => {
  it("PAID resolves to Car-Out only when the Backend allows it", () => {
    assert.equal(getContractRowAction(row("PAID", { canCarOut: true }))?.kind, "carOut");
    assert.equal(getContractRowAction(row("PAID")), null);
  });

  it("ACTIVE opens the contract instead of issuing a return link", () => {
    const action = getContractRowAction(row("ACTIVE"));
    assert.equal(action?.kind, "manage");
    assert.notEqual(action?.labelKey, "actions.returnLink");
  });

  it("RETOUT resolves to Receive Vehicle from the Backend flag", () => {
    assert.equal(getContractRowAction(row("RETOUT", { canCarIn: true }))?.kind, "carIn");
    assert.equal(getContractRowAction(row("RETOUT")), null);
  });

  it("earlier and final states use existing actions or fall back to View contract", () => {
    assert.equal(getContractRowAction(row("AWAITING"))?.kind, "rentalLink");
    assert.equal(getContractRowAction(row("FORM"))?.kind, "rentalLink");
    assert.equal(getContractRowAction(row("SIGNED")), null);
    assert.equal(getContractRowAction(row("REVIEW"))?.kind, "reconcile");
    assert.equal(getContractRowAction(row("CLOSED")), null);
  });
});
