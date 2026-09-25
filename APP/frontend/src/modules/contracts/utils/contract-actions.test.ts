import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getContractActions } from "./contract-actions.ts";
import type { ContractActionsDto, ContractStatus } from "../types/contract.types.ts";

const allTrue: ContractActionsDto = {
  canGenerateRentalLink: true,
  canConfirmPayment: true,
  canCarOut: true,
  canGenerateReturnLink: true,
  canCarIn: true,
  canReconcile: true,
  canClose: true,
  canRenew: true,
};

const perms = {
  canManage: true,
  canActivate: true,
  canCarOut: true,
  canReturn: true,
  canReconcile: true,
  canClose: true,
  canRenew: true,
};

function actionsFor(status: ContractStatus, dto: Partial<ContractActionsDto> = {}) {
  return getContractActions(
    { status, actions: { ...allTrue, ...dto } },
    perms,
  );
}

describe("getContractActions", () => {
  it("AWAITING shows rental link only among mutating actions", () => {
    const actions = actionsFor("AWAITING", {
      canGenerateRentalLink: true,
      canConfirmPayment: false,
      canCarOut: false,
      canGenerateReturnLink: false,
      canCarIn: false,
      canReconcile: false,
      canClose: false,
      canRenew: false,
    });
    assert.equal(actions.showGenerateRentalLink, true);
    assert.equal(actions.showConfirmPayment, false);
    assert.equal(actions.showCarOut, false);
    assert.equal(actions.showCarIn, false);
    assert.equal(actions.showRenew, false);
  });

  it("FORM is detail-only among mutating actions", () => {
    const actions = actionsFor("FORM", {
      canGenerateRentalLink: true,
      canConfirmPayment: false,
      canCarOut: false,
      canGenerateReturnLink: false,
      canCarIn: false,
      canReconcile: false,
      canClose: false,
      canRenew: false,
    });
    assert.equal(actions.showGenerateRentalLink, true);
    assert.equal(actions.showConfirmPayment, false);
    assert.equal(actions.showCarOut, false);
    assert.equal(actions.showRenew, false);
  });

  it("SIGNED shows confirm payment", () => {
    const actions = actionsFor("SIGNED", {
      canGenerateRentalLink: true,
      canConfirmPayment: true,
      canCarOut: false,
      canGenerateReturnLink: false,
      canCarIn: false,
      canReconcile: false,
      canClose: false,
      canRenew: false,
    });
    assert.equal(actions.showConfirmPayment, true);
    assert.equal(actions.showCarOut, false);
  });

  it("PAID shows Car-Out only", () => {
    const actions = actionsFor("PAID", {
      canGenerateRentalLink: false,
      canConfirmPayment: false,
      canCarOut: true,
      canGenerateReturnLink: false,
      canCarIn: false,
      canReconcile: false,
      canClose: false,
      canRenew: false,
    });
    assert.equal(actions.showCarOut, true);
    assert.equal(actions.showGenerateReturnLink, false);
    assert.equal(actions.showCarIn, false);
  });

  it("ACTIVE shows return link and renew", () => {
    const actions = actionsFor("ACTIVE", {
      canGenerateRentalLink: false,
      canConfirmPayment: false,
      canCarOut: false,
      canGenerateReturnLink: true,
      canCarIn: false,
      canReconcile: false,
      canClose: false,
      canRenew: true,
    });
    assert.equal(actions.showGenerateReturnLink, true);
    assert.equal(actions.showRenew, true);
    assert.equal(actions.showCarOut, false);
    assert.equal(actions.showCarIn, false);
  });

  it("RETOUT shows staff Car-In and hides waiting when permitted", () => {
    const actions = actionsFor("RETOUT", {
      canGenerateRentalLink: false,
      canConfirmPayment: false,
      canCarOut: false,
      canGenerateReturnLink: false,
      canCarIn: true,
      canReconcile: false,
      canClose: false,
      canRenew: false,
    });
    assert.equal(actions.showCarIn, true);
    assert.equal(actions.showReturnWaiting, false);
    assert.equal(actions.showRenew, false);
    assert.equal(actions.showCarOut, false);
    assert.equal(actions.showGenerateRentalLink, false);
    assert.equal(actions.showClose, false);
  });

  it("RETOUT waits when Car-In is not available", () => {
    const actions = actionsFor("RETOUT", {
      canGenerateRentalLink: false,
      canConfirmPayment: false,
      canCarOut: false,
      canGenerateReturnLink: false,
      canCarIn: false,
      canReconcile: false,
      canClose: false,
      canRenew: false,
    });
    assert.equal(actions.showCarIn, false);
    assert.equal(actions.showReturnWaiting, true);
  });

  it("REVIEW shows reconciliation", () => {
    const actions = actionsFor("REVIEW", {
      canGenerateRentalLink: false,
      canConfirmPayment: false,
      canCarOut: false,
      canGenerateReturnLink: false,
      canCarIn: false,
      canReconcile: true,
      canClose: false,
      canRenew: false,
    });
    assert.equal(actions.showReconcile, true);
    assert.equal(actions.showClose, false);
    assert.equal(actions.showCarIn, false);
  });

  it("REVIEW with approved reconciliation shows close", () => {
    const actions = actionsFor("REVIEW", {
      canGenerateRentalLink: false,
      canConfirmPayment: false,
      canCarOut: false,
      canGenerateReturnLink: false,
      canCarIn: false,
      canReconcile: true,
      canClose: true,
      canRenew: false,
    });
    assert.equal(actions.showClose, true);
  });

  it("REVIEW with settled reconciliation hides reconcile", () => {
    const actions = actionsFor("REVIEW", {
      canGenerateRentalLink: false,
      canConfirmPayment: false,
      canCarOut: false,
      canGenerateReturnLink: false,
      canCarIn: false,
      canReconcile: false,
      canClose: true,
      canRenew: false,
    });
    assert.equal(actions.showReconcile, false);
    assert.equal(actions.showClose, true);
  });

  it("CLOSED is read-only", () => {
    const actions = actionsFor("CLOSED");
    assert.deepEqual(actions, {
      showGenerateRentalLink: false,
      showConfirmPayment: false,
      showCarOut: false,
      showGenerateReturnLink: false,
      showCarIn: false,
      showReturnWaiting: false,
      showRenew: false,
      showReconcile: false,
      showClose: false,
    });
  });

  it("hides Car-In without return permission", () => {
    const actions = getContractActions(
      {
        status: "RETOUT",
        actions: { ...allTrue, canCarIn: true },
      },
      { ...perms, canReturn: false },
    );
    assert.equal(actions.showCarIn, false);
    assert.equal(actions.showReturnWaiting, true);
  });

  it("hides Car-Out without both activate and car_out permissions", () => {
    const actions = getContractActions(
      {
        status: "PAID",
        actions: { ...allTrue, canCarOut: true },
      },
      { ...perms, canCarOut: true, canActivate: false },
    );
    assert.equal(actions.showCarOut, false);
  });
});
