/**
 * Stable functional capability keys — mirror `APP/backend/src/lib/rbac/functional-permissions/keys.ts`.
 */
export const FN = {
  dashboard: {
    full: "diamond.fn.dashboard.full",
  },
  vehicles: {
    viewPage: "diamond.fn.vehicles.view_page",
    addDelete: "diamond.fn.vehicles.add_delete",
    editPrices: "diamond.fn.vehicles.edit_prices",
  },
  gps: {
    full: "diamond.fn.gps.full",
  },
  maintenance: {
    viewPage: "diamond.fn.maintenance.view_page",
    create: "diamond.fn.maintenance.create",
    manageLifecycle: "diamond.fn.maintenance.manage_lifecycle",
  },
  archive: {
    full: "diamond.fn.archive.full",
  },
  violations: {
    viewPage: "diamond.fn.violations.view_page",
    reviewDues: "diamond.fn.violations.review_dues",
    collectCharges: "diamond.fn.violations.collect_charges",
  },
  finance: {
    viewPage: "diamond.fn.finance.view_page",
    addExpense: "diamond.fn.finance.add_expense",
    correctExpense: "diamond.fn.finance.correct_expense",
    voidExpense: "diamond.fn.finance.void_expense",
  },
  invoices: {
    viewPage: "diamond.fn.invoices.view_page",
    downloadPdf: "diamond.fn.invoices.download_pdf",
    sendWhatsapp: "diamond.fn.invoices.send_whatsapp",
  },
  contracts: {
    viewPage: "diamond.fn.contracts.view_page",
    rentalLink: "diamond.fn.contracts.rental_link",
    deliveryReturnReconcile: "diamond.fn.contracts.delivery_return_reconcile",
    collectionClosure: "diamond.fn.contracts.collection_closure",
    renewal: "diamond.fn.contracts.renewal",
  },
  whatsapp: {
    full: "diamond.fn.whatsapp.full",
  },
  users: {
    viewPage: "diamond.fn.users.view_page",
    create: "diamond.fn.users.create",
    edit: "diamond.fn.users.edit",
    assignRoles: "diamond.fn.users.assign_roles",
    enableDisable: "diamond.fn.users.enable_disable",
    delete: "diamond.fn.users.delete",
  },
  roles: {
    viewPage: "diamond.fn.roles.view_page",
    createEdit: "diamond.fn.roles.create_edit",
    managePermissions: "diamond.fn.roles.manage_permissions",
  },
} as const;

export type FunctionalCapabilityKey =
  | (typeof FN.dashboard)[keyof typeof FN.dashboard]
  | (typeof FN.vehicles)[keyof typeof FN.vehicles]
  | (typeof FN.gps)[keyof typeof FN.gps]
  | (typeof FN.maintenance)[keyof typeof FN.maintenance]
  | (typeof FN.archive)[keyof typeof FN.archive]
  | (typeof FN.violations)[keyof typeof FN.violations]
  | (typeof FN.finance)[keyof typeof FN.finance]
  | (typeof FN.invoices)[keyof typeof FN.invoices]
  | (typeof FN.contracts)[keyof typeof FN.contracts]
  | (typeof FN.whatsapp)[keyof typeof FN.whatsapp]
  | (typeof FN.users)[keyof typeof FN.users]
  | (typeof FN.roles)[keyof typeof FN.roles];

export const ALL_FUNCTIONAL_CAPABILITY_KEYS: readonly FunctionalCapabilityKey[] =
  Object.values(FN).flatMap((group) => Object.values(group)) as FunctionalCapabilityKey[];

const FUNCTIONAL_KEY_SET = new Set<string>(ALL_FUNCTIONAL_CAPABILITY_KEYS);

export function isFunctionalCapabilityKey(key: string): boolean {
  return FUNCTIONAL_KEY_SET.has(key);
}
