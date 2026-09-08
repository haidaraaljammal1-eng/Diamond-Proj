/** Backend catalog keys from `APP/backend/src/constants/permissions.ts`. */
export const CONTRACTS_READ_PERMISSION = "contracts.read";
export const CONTRACTS_MANAGE_PERMISSION = "contracts.manage";
export const CONTRACTS_ACTIVATE_PERMISSION = "contracts.activate";
export const CONTRACTS_CAR_OUT_PERMISSION = "contracts.car_out";
export const CONTRACTS_RETURN_PERMISSION = "contracts.return";
export const CONTRACTS_RECONCILE_PERMISSION = "contracts.reconcile";
export const CONTRACTS_CLOSE_PERMISSION = "contracts.close";
export const CONTRACTS_RENEW_PERMISSION = "contracts.renew";

export const CONTRACTS_PAGE_PERMISSIONS = [CONTRACTS_READ_PERMISSION] as const;
