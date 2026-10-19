import type { ContractActionsDto, ContractStatus } from "../types/contract.types";

export interface ContractPermissionFlags {
  canManage: boolean;
  canActivate: boolean;
  canCarOut: boolean;
  canReturn: boolean;
  canReconcile: boolean;
  canClose: boolean;
  canRenew: boolean;
  canChargeViolation: boolean;
}

export interface ContractUiActions {
  showGenerateRentalLink: boolean;
  showConfirmPayment: boolean;
  showCarOut: boolean;
  showGenerateReturnLink: boolean;
  showCarIn: boolean;
  showReturnWaiting: boolean;
  showRenew: boolean;
  showRegisterDeferredRoadCharge: boolean;
  showReconcile: boolean;
  showClose: boolean;
}

const NONE: ContractUiActions = {
  showGenerateRentalLink: false,
  showConfirmPayment: false,
  showCarOut: false,
  showGenerateReturnLink: false,
  showCarIn: false,
  showReturnWaiting: false,
  showRenew: false,
  showRegisterDeferredRoadCharge: false,
  showReconcile: false,
  showClose: false,
};

/**
 * Central staff action policy. Backend `actions` is authority; permissions
 * only hide controls the user cannot call.
 */
export function getContractActions(
  contract: { status: ContractStatus; actions: ContractActionsDto },
  permissions: ContractPermissionFlags,
): ContractUiActions {
  const { actions, status } = contract;

  const showRegisterDeferredRoadCharge =
    actions.canRegisterDeferredRoadCharge &&
    permissions.canChargeViolation &&
    (status === "ACTIVE" ||
      status === "RETOUT" ||
      status === "REVIEW" ||
      status === "CLOSED");

  if (status === "CLOSED") {
    return { ...NONE, showRegisterDeferredRoadCharge };
  }

  return {
    showGenerateRentalLink:
      actions.canGenerateRentalLink && permissions.canManage,
    showConfirmPayment: actions.canConfirmPayment && permissions.canClose,
    showCarOut:
      actions.canCarOut && permissions.canCarOut && permissions.canActivate,
    showGenerateReturnLink:
      status === "ACTIVE" &&
      actions.canGenerateReturnLink &&
      permissions.canReturn,
    showCarIn: status === "RETOUT" && actions.canCarIn && permissions.canReturn,
    showReturnWaiting:
      status === "RETOUT" && !(actions.canCarIn && permissions.canReturn),
    showRenew: actions.canRenew && permissions.canRenew && status === "ACTIVE",
    showRegisterDeferredRoadCharge,
    showReconcile: actions.canReconcile && permissions.canReconcile,
    showClose: actions.canClose && permissions.canClose,
  };
}
