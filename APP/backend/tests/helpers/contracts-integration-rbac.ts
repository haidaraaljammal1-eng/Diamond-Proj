import { FN } from "src/lib/rbac/functional-permissions/keys";

/** Legacy permission keys used by contracts integration fixtures. */
export const CONTRACTS_INTEGRATION_LEGACY_PERMS = [
  "vehicles.read",
  "vehicles.manage",
  "contracts.read",
  "contracts.manage",
  "contracts.activate",
  "contracts.car_out",
  "contracts.return",
  "contracts.reconcile",
  "contracts.close",
  "contracts.renew",
  "reference_data.lookup",
] as const;

/**
 * Required when `FUNCTIONAL_RBAC_V2_ENABLED` is true (local `.env` default on this branch).
 * Mapped routes ignore legacy keys — see `enforce-permissions.ts`.
 */
export const CONTRACTS_INTEGRATION_FUNCTIONAL_GRANTS = [
  FN.vehicles.viewPage,
  FN.vehicles.addDelete,
  FN.vehicles.editPrices,
  FN.contracts.viewPage,
  FN.contracts.rentalLink,
  FN.contracts.operationsClosure,
  FN.contracts.renewal,
] as const;

export const CONTRACTS_INTEGRATION_ALL_PERMS = [
  ...CONTRACTS_INTEGRATION_LEGACY_PERMS,
  ...CONTRACTS_INTEGRATION_FUNCTIONAL_GRANTS,
] as const;

export function permissionCategory(key: string): string {
  if (key.startsWith("diamond.fn.")) return "functional";
  return key.split(".")[0] ?? "misc";
}
