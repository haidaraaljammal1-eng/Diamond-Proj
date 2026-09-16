import type { ContractActionsDto, ContractStatus } from "../types/contract.types";

export interface ContractPermissionFlags {
  canManage: boolean;
  canActivate: boolean;
  canCarOut: boolean;
  canReturn: boolean;
  canReconcile: boolean;
  canClose: boolean;
  canRenew: boolean;
}

export interface ContractUiActions {
  showGenerateRentalLink: boolean;
  showConfirmPayment: boolean;
  showCarOut: boolean;
  showGenerateReturnLink: boolean;
  showCarIn: boolean;
  showReturnWaiting: boolean;
  showRenew: boolean;
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

  if (status === "CLOSED") return NONE;

  return {
    showGenerateRentalLink:
      actions.canGenerateRentalLink && permissions.canManage,
    showConfirmPayment: actions.canConfirmPayment && permissions.canManage,
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
    showReconcile: actions.canReconcile && permissions.canReconcile,
    showClose: actions.canClose && permissions.canClose,
  };
}
