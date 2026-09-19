import type { ContractListItemDto } from "../types/contract.types";

export type ContractRowActionKind = "rentalLink" | "carOut" | "manage" | "carIn" | "reconcile";

export interface ContractRowAction {
  kind: ContractRowActionKind;
  /** `Contracts` translation key for the label. */
  labelKey: string;
  icon: string;
}

const ACTIONS: Record<ContractRowActionKind, ContractRowAction> = {
  rentalLink: { kind: "rentalLink", labelKey: "actions.rentalLink", icon: "mdi:link-variant" },
  carOut: { kind: "carOut", labelKey: "actions.carOut", icon: "mdi:car-key" },
  manage: { kind: "manage", labelKey: "actions.manage", icon: "mdi:car-clock" },
  carIn: { kind: "carIn", labelKey: "actions.carIn", icon: "mdi:car-arrow-left" },
  reconcile: { kind: "reconcile", labelKey: "actions.reconcile", icon: "mdi:scale-balance" },
};

/**
 * The one primary action a Contracts row offers now, from the Backend status and
 * list `actions`. ACTIVE opens the contract, where Renew and the return link
 * live side by side: issuing a return link is not the return itself. `null`
 * leaves only View contract (SIGNED, CLOSED, or an action the Backend refuses).
 */
export function getContractRowAction(contract: Pick<ContractListItemDto, "status" | "actions">): ContractRowAction | null {
  switch (contract.status) {
    case "AWAITING":
    case "FORM":
      return ACTIONS.rentalLink;
    case "PAID":
      return contract.actions.canCarOut ? ACTIONS.carOut : null;
    case "ACTIVE":
      return ACTIONS.manage;
    case "RETOUT":
      return contract.actions.canCarIn ? ACTIONS.carIn : null;
    case "REVIEW":
      return ACTIONS.reconcile;
    default:
      return null;
  }
}
