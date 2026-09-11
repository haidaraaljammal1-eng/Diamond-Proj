import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getContractActions } from "./contract-actions.ts";

const perms = {
  canManage: true,
  canActivate: true,
  canCarOut: true,
  canReturn: true,
  canReconcile: true,
  canClose: true,
  canRenew: true,
};

describe("contracts payment UI policy", () => {
  test("never shows manual staff payment confirmation in V1", () => {
    const actions = getContractActions(
      {
        status: "SIGNED",
        actions: {
          canGenerateRentalLink: false,
          canConfirmPayment: false,
          canCarOut: false,
          canGenerateReturnLink: false,
          canCarIn: false,
          canReconcile: false,
          canClose: false,
          canRenew: false,
        },
      },
      perms,
    );
    assert.equal(actions.showConfirmPayment, false);
  });

  test("blocks close while reconciliation is unpaid", () => {
    const actions = getContractActions(
      {
        status: "REVIEW",
        actions: {
          canGenerateRentalLink: false,
          canConfirmPayment: false,
          canCarOut: false,
          canGenerateReturnLink: false,
          canCarIn: false,
          canReconcile: true,
          canClose: false,
          canRenew: false,
        },
      },
      perms,
    );
    assert.equal(actions.showClose, false);
    assert.equal(actions.showReconcile, true);
  });

  test("allows close after reconciliation settlement", () => {
    const actions = getContractActions(
      {
        status: "REVIEW",
        actions: {
          canGenerateRentalLink: false,
          canConfirmPayment: false,
          canCarOut: false,
          canGenerateReturnLink: false,
          canCarIn: false,
          canReconcile: false,
          canClose: true,
          canRenew: false,
        },
      },
      perms,
    );
    assert.equal(actions.showClose, true);
  });
});
