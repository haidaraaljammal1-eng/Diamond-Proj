import { ROUTE_FUNCTIONAL_REQUIREMENTS } from "./route-requirements";

/**
 * Staff modules covered by Diamond RBAC V2 (12 pages + contextual lookups).
 * Public/webhook/auth routes are excluded from fail-closed V2 mapping.
 */
export const DIAMOND_V2_MODULE_PREFIXES = [
  "dashboard/",
  "vehicles/",
  "gps/",
  "maintenance/",
  "archive/",
  "road-liabilities/",
  "finance/",
  "invoices/",
  "contracts/routes/admin/",
  "whatsapp/routes/admin/",
  "users/",
  "roles/",
  "permissions/",
  "lookups/",
] as const;

/**
 * Outside the 34 capabilities but intentionally keep legacy ANY-of under V2
 * (complaint/PE pickers, password reset until a dedicated capability exists).
 */
export const V2_LEGACY_ANY_FALLBACK_OPERATION_IDS = new Set<string>([
  "lookupUsers",
  "lookupPurchaseExperiences",
  "lookupCommunicationTemplates",
]);

export function isDiamondV2MappedOperation(operationId: string): boolean {
  return (
    operationId in ROUTE_FUNCTIONAL_REQUIREMENTS ||
    V2_LEGACY_ANY_FALLBACK_OPERATION_IDS.has(operationId)
  );
}

/** deleteRole is enforced via system-admin-only hook, not a functional capability. */
export const V2_SYSTEM_ADMIN_ONLY_OPERATION_IDS = new Set<string>([
  "deleteRole",
  "resetUserPassword",
]);

export function diamondV2MappedOperationCount(): number {
  return Object.keys(ROUTE_FUNCTIONAL_REQUIREMENTS).length;
}

const DIAMOND_STAFF_URL_PREFIXES = [
  /^\/dashboard(\/|$)/,
  /^\/vehicles(\/|$)/,
  /^\/gps(\/|$)/,
  /^\/maintenance(\/|$)/,
  /^\/archive(\/|$)/,
  /^\/road-liabilities(\/|$)/,
  /^\/finance(\/|$)/,
  /^\/invoices(\/|$)/,
  /^\/contracts(\/|$)/,
  /^\/whatsapp(\/|$)/,
  /^\/users(\/|$)/,
  /^\/roles(\/|$)/,
  /^\/permissions(\/|$)/,
  /^\/lookups(\/|$)/,
] as const;

/** Staff Diamond page APIs (excludes public rental, webhooks, auth). */
export function isDiamondStaffRouteUrl(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return DIAMOND_STAFF_URL_PREFIXES.some((re) => re.test(path));
}
