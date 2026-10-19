import { PERMISSIONS } from "src/constants/permissions";
import { FN } from "./keys";
import type {
  FunctionalCapabilityDefinition,
  FunctionalPageDefinition,
  FunctionalPageId,
} from "./types";

const P = PERMISSIONS;

function def(
  entry: FunctionalCapabilityDefinition,
): FunctionalCapabilityDefinition {
  return entry;
}

/** Canonical owner-approved functional capability registry (Phase 1 — inactive enforcement). */
export const FUNCTIONAL_CAPABILITY_REGISTRY: readonly FunctionalCapabilityDefinition[] =
  [
    def({
      key: FN.dashboard.full,
      pageId: "dashboard",
      kind: "page_full_control",
      pageModel: "single_full_control",
      parentKey: null,
      labels: { ar: "عرض الصفحة والتحكم الكامل", en: "View Page & Full Control" },
      operationalActions: ["getDashboardOverview"],
      technicalMapping: {
        existingKeys: [P.DASHBOARD_READ],
        readiness: "partial",
        notes:
          "Dashboard sections also gate on domain reads inside dashboard.service until Phase 2 closure.",
      },
      contextualLookups: [],
    }),

    def({
      key: FN.vehicles.viewPage,
      pageId: "vehicles",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض المركبات", en: "View Vehicles" },
      operationalActions: ["listVehicles", "getVehicle", "streamVehiclePhoto"],
      technicalMapping: {
        existingKeys: [P.VEHICLES_READ],
        readiness: "ready",
      },
    }),
    def({
      key: FN.vehicles.addDelete,
      pageId: "vehicles",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.vehicles.viewPage,
      labels: { ar: "إضافة وحذف مركبة", en: "Add & Delete Vehicle" },
      operationalActions: [
        "createVehicle",
        "deactivateVehicle",
        "reactivateVehicle",
        "uploadVehiclePhoto",
        "deleteVehiclePhoto",
      ],
      technicalMapping: {
        existingKeys: [P.VEHICLES_MANAGE],
        proposedKeys: ["vehicles.create", "vehicles.deactivate"],
        readiness: "deferred",
        notes: "Today vehicles.manage also allows full PUT identity fields — Phase 2 must narrow.",
      },
    }),
    def({
      key: FN.vehicles.editPrices,
      pageId: "vehicles",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.vehicles.viewPage,
      labels: { ar: "تعديل أسعار المركبة", en: "Edit Vehicle Prices" },
      operationalActions: ["updateVehicleRates"],
      technicalMapping: {
        existingKeys: [P.VEHICLES_MANAGE],
        proposedKeys: ["vehicles.edit_prices"],
        readiness: "deferred",
        notes: "UI sends rate-only PUT; service must enforce field scope in Phase 2.",
      },
    }),

    def({
      key: FN.gps.full,
      pageId: "gps",
      kind: "page_full_control",
      pageModel: "single_full_control",
      parentKey: null,
      labels: { ar: "عرض الصفحة والتحكم الكامل", en: "View Page & Full Control" },
      operationalActions: ["listGpsVehicles", "gpsRealtime"],
      technicalMapping: {
        existingKeys: [P.GPS_READ],
        readiness: "ready",
      },
    }),

    def({
      key: FN.maintenance.viewPage,
      pageId: "maintenance",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
      operationalActions: ["listMaintenanceOrders", "getMaintenanceOrder", "getMaintenanceSummary"],
      technicalMapping: {
        existingKeys: [P.MAINTENANCE_READ],
        readiness: "ready",
      },
    }),
    def({
      key: FN.maintenance.create,
      pageId: "maintenance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.maintenance.viewPage,
      labels: { ar: "إنشاء أمر صيانة", en: "Create Maintenance Order" },
      operationalActions: ["createMaintenanceOrder"],
      technicalMapping: {
        existingKeys: [P.MAINTENANCE_MANAGE],
        proposedKeys: ["maintenance.create"],
        readiness: "deferred",
      },
      contextualLookups: [
        {
          description: "Pick available fleet vehicle for new order",
          lookupPermission: P.REFERENCE_DATA_LOOKUP,
          requiredCapability: FN.maintenance.create,
        },
        {
          description: "Fleet vehicle picker fallback",
          lookupPermission: P.VEHICLES_READ,
          requiredCapability: FN.maintenance.create,
        },
      ],
    }),
    def({
      key: FN.maintenance.manageLifecycle,
      pageId: "maintenance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.maintenance.viewPage,
      labels: {
        ar: "إدارة مركبات قيد الصيانة",
        en: "Manage Vehicles in Maintenance",
      },
      operationalActions: [
        "updateMaintenanceOrder",
        "startMaintenanceOrder",
        "readyMaintenanceOrder",
        "completeMaintenanceOrder",
        "cancelMaintenanceOrder",
      ],
      technicalMapping: {
        existingKeys: [P.MAINTENANCE_MANAGE],
        proposedKeys: ["maintenance.manage_lifecycle"],
        readiness: "deferred",
        notes: "Must not include createMaintenanceOrder when enforced.",
      },
    }),

    def({
      key: FN.archive.full,
      pageId: "archive",
      kind: "page_full_control",
      pageModel: "single_full_control",
      parentKey: null,
      labels: { ar: "عرض الصفحة والتحكم الكامل", en: "View Page & Full Control" },
      operationalActions: [
        "listArchiveRows",
        "exportArchiveWorkbook",
        "createArchiveRow",
        "updateArchiveRow",
        "deleteArchiveRow",
        "previewArchiveImport",
        "confirmArchiveImport",
        "getArchiveSyncStatus",
        "syncArchive",
        "restoreArchiveChargeField",
      ],
      technicalMapping: {
        existingKeys: [P.ARCHIVE_READ, P.ARCHIVE_MANAGE],
        readiness: "ready",
      },
    }),

    def({
      key: FN.violations.viewPage,
      pageId: "violations",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
      operationalActions: [
        "listRoadLiabilities",
        "getRoadLiability",
        "roadLiabilitiesSummary",
        "listReturnedContractsForRoadCharges",
      ],
      technicalMapping: {
        existingKeys: [P.VIOLATIONS_READ],
        readiness: "ready",
      },
    }),
    def({
      key: FN.violations.reviewDues,
      pageId: "violations",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.violations.viewPage,
      labels: { ar: "مراجعة المستحقات", en: "Review Dues" },
      operationalActions: ["getRoadLiabilityChargeReview"],
      technicalMapping: {
        existingKeys: [P.VIOLATIONS_READ],
        readiness: "partial",
        notes:
          "Charge review GET is violations.read today; Phase 2 may split sensitive review data.",
      },
    }),
    def({
      key: FN.violations.collectCharges,
      pageId: "violations",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.violations.viewPage,
      labels: { ar: "تحصيل الرسوم", en: "Collect Charges" },
      operationalActions: [
        "confirmRoadLiabilityCharge",
        "collectRoadLiabilityOffSession",
        "roadLiabilityCashConfirm",
        "roadLiabilityManualReceipt",
        "staffManualChargeReturnedContract",
        "registerContractDeferredRoadCharge",
        "confirmFinanceOpenReceivableRoadLiabilityCash",
      ],
      technicalMapping: {
        existingKeys: [P.VIOLATIONS_CHARGE],
        readiness: "ready",
      },
    }),

    def({
      key: FN.finance.viewPage,
      pageId: "finance",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
      operationalActions: [
        "financeSummary",
        "financeAnalytics",
        "financeLedger",
        "financeOpenReceivables",
        "confirmFinanceOpenReceivableRoadLiabilityCash",
        "getFinanceStatementBusinessToday",
        "downloadFinanceStatementPdf",
      ],
      technicalMapping: {
        existingKeys: [P.FINANCE_READ],
        readiness: "ready",
      },
    }),
    def({
      key: FN.finance.addExpense,
      pageId: "finance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.finance.viewPage,
      labels: { ar: "إضافة مصروف", en: "Add Expense" },
      operationalActions: ["createManualExpense"],
      technicalMapping: {
        existingKeys: [P.FINANCE_MANAGE_EXPENSES],
        proposedKeys: ["finance.expense.create"],
        readiness: "deferred",
      },
    }),
    def({
      key: FN.finance.correctExpense,
      pageId: "finance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.finance.viewPage,
      labels: { ar: "تصحيح مصروف", en: "Correct Expense" },
      operationalActions: ["correctManualExpense"],
      technicalMapping: {
        existingKeys: [P.FINANCE_MANAGE_EXPENSES],
        proposedKeys: ["finance.expense.correct"],
        readiness: "deferred",
      },
    }),
    def({
      key: FN.finance.voidExpense,
      pageId: "finance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.finance.viewPage,
      labels: { ar: "إبطال مصروف", en: "Void Expense" },
      operationalActions: ["voidManualExpense"],
      technicalMapping: {
        existingKeys: [P.FINANCE_MANAGE_EXPENSES],
        proposedKeys: ["finance.expense.void"],
        readiness: "deferred",
      },
    }),

    def({
      key: FN.invoices.viewPage,
      pageId: "invoices",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
      operationalActions: ["listInvoices", "getInvoice", "listInvoiceDeliveries"],
      technicalMapping: {
        existingKeys: [P.INVOICES_READ],
        readiness: "ready",
        notes: "List/detail only; PDF is a separate child capability.",
      },
    }),
    def({
      key: FN.invoices.downloadPdf,
      pageId: "invoices",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.invoices.viewPage,
      labels: { ar: "تنزيل PDF", en: "Download PDF" },
      operationalActions: ["getInvoicePdf"],
      technicalMapping: {
        existingKeys: [P.INVOICES_READ],
        proposedKeys: ["invoices.download_pdf"],
        readiness: "deferred",
        notes: "Today PDF uses invoices.read — Phase 2 splits route guard.",
      },
    }),
    def({
      key: FN.invoices.sendWhatsapp,
      pageId: "invoices",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.invoices.viewPage,
      labels: { ar: "إرسال الفاتورة عبر واتساب", en: "Send Invoice via WhatsApp" },
      operationalActions: ["sendInvoiceWhatsApp"],
      technicalMapping: {
        existingKeys: [P.INVOICES_SEND_WHATSAPP],
        readiness: "ready",
      },
    }),

    def({
      key: FN.contracts.viewPage,
      pageId: "contracts",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
      operationalActions: ["listContracts", "getContract", "getContractTarsState"],
      technicalMapping: {
        existingKeys: [P.CONTRACTS_READ],
        readiness: "ready",
      },
    }),
    def({
      key: FN.contracts.rentalLink,
      pageId: "contracts",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.contracts.viewPage,
      labels: {
        ar: "إنشاء رابط تأجير",
        en: "Create Rental Link",
      },
      operationalActions: [
        "createContractOffer",
        "updateOfficialContractTerms",
        "generateContractRentalLink",
        "deletePendingRentalRequest",
      ],
      technicalMapping: {
        existingKeys: [P.CONTRACTS_MANAGE],
        readiness: "partial",
      },
      contextualLookups: [
        {
          description: "Vehicle context for offer from fleet",
          lookupPermission: P.VEHICLES_READ,
          requiredCapability: FN.contracts.rentalLink,
        },
        {
          description: "Reference data in offer forms",
          lookupPermission: P.REFERENCE_DATA_LOOKUP,
          requiredCapability: FN.contracts.rentalLink,
        },
      ],
    }),
    def({
      key: FN.contracts.deliveryReturnReconcile,
      pageId: "contracts",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.contracts.viewPage,
      labels: {
        ar: "تسليم المركبة والإرجاع والتسوية",
        en: "Vehicle Delivery, Return & Reconciliation",
      },
      operationalActions: [
        "completeContractCarOut",
        "generateContractReturnLink",
        "startContractReturnStaff",
        "completeContractCarIn",
        "reconcileContract",
        "finalizeContractReconciliation",
      ],
      technicalMapping: {
        existingKeys: [
          P.CONTRACTS_CAR_OUT,
          P.CONTRACTS_ACTIVATE,
          P.CONTRACTS_RETURN,
          P.CONTRACTS_RECONCILE,
        ],
        readiness: "partial",
        notes: "Car-Out completion requires car_out AND activate (ALL semantics on route).",
      },
    }),
    def({
      key: FN.contracts.collectionClosure,
      pageId: "contracts",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.contracts.viewPage,
      labels: {
        ar: "التحصيل وإغلاق العقد",
        en: "Collection & Contract Closure",
      },
      operationalActions: [
        "settleContractReconciliationCash",
        "startReconciliationPayment",
        "closeContract",
      ],
      technicalMapping: {
        existingKeys: [P.CONTRACTS_RECONCILE, P.CONTRACTS_CLOSE],
        readiness: "partial",
        notes:
          "Post-close road liability collection stays under violations.collect_charges, not this capability.",
      },
    }),
    def({
      key: FN.contracts.renewal,
      pageId: "contracts",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.contracts.viewPage,
      labels: { ar: "تجديد العقد", en: "Contract Renewal" },
      operationalActions: [
        "generateContractRenewalLink",
        "settleContractRenewalCash",
      ],
      technicalMapping: {
        existingKeys: [P.CONTRACTS_RENEW],
        readiness: "ready",
      },
    }),

    def({
      key: FN.whatsapp.full,
      pageId: "whatsapp",
      kind: "page_full_control",
      pageModel: "single_full_control",
      parentKey: null,
      labels: { ar: "عرض الصفحة والتحكم الكامل", en: "View Page & Full Control" },
      operationalActions: [
        "whatsappConversations",
        "whatsappSend",
        "whatsappManageConnection",
        "whatsappLinkCustomer",
      ],
      technicalMapping: {
        existingKeys: [
          P.WHATSAPP_READ,
          P.WHATSAPP_SEND,
          P.WHATSAPP_MANAGE_CONNECTION,
          P.WHATSAPP_LINK_CUSTOMER,
        ],
        readiness: "ready",
      },
      contextualLookups: [
        {
          description: "Optional customer PII strip — not broad customers.read",
          lookupPermission: P.CUSTOMERS_READ,
          requiredCapability: FN.whatsapp.full,
        },
      ],
    }),

    def({
      key: FN.users.viewPage,
      pageId: "users",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
      operationalActions: ["listUsers", "getUser"],
      technicalMapping: {
        existingKeys: [P.USERS_READ],
        readiness: "ready",
      },
    }),
    def({
      key: FN.users.create,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "إنشاء مستخدم", en: "Create User" },
      operationalActions: ["createUser"],
      technicalMapping: {
        existingKeys: [P.USERS_CREATE],
        readiness: "ready",
      },
      contextualLookups: [
        {
          description: "Role picker when creating user",
          lookupPermission: P.ROLES_READ,
          requiredCapability: FN.users.assignRoles,
        },
      ],
    }),
    def({
      key: FN.users.edit,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "تعديل مستخدم", en: "Edit User" },
      operationalActions: ["updateUser"],
      technicalMapping: {
        existingKeys: [P.USERS_UPDATE],
        readiness: "partial",
        notes: "Today users.update also covers status and roles until split in Phase 2.",
      },
    }),
    def({
      key: FN.users.assignRoles,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "إدارة أدوار المستخدم", en: "Manage User Role Assignments" },
      operationalActions: ["setUserRoles"],
      technicalMapping: {
        existingKeys: [P.USERS_UPDATE],
        proposedKeys: ["users.assign_roles"],
        readiness: "deferred",
      },
    }),
    def({
      key: FN.users.enableDisable,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "تفعيل / تعطيل مستخدم", en: "Enable / Disable User" },
      operationalActions: ["setUserStatus"],
      technicalMapping: {
        existingKeys: [P.USERS_UPDATE],
        proposedKeys: ["users.status"],
        readiness: "deferred",
      },
    }),
    def({
      key: FN.users.delete,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "حذف مستخدم", en: "Delete User" },
      operationalActions: ["deleteUser"],
      technicalMapping: {
        existingKeys: [P.USERS_DELETE],
        readiness: "ready",
      },
    }),

    def({
      key: FN.roles.viewPage,
      pageId: "roles",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
      operationalActions: ["listRoles", "listPermissions"],
      technicalMapping: {
        existingKeys: [P.ROLES_READ, P.PERMISSIONS_READ],
        readiness: "ready",
      },
    }),
    def({
      key: FN.roles.createEdit,
      pageId: "roles",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.roles.viewPage,
      labels: { ar: "إنشاء / تعديل الأدوار", en: "Create / Edit Roles" },
      operationalActions: ["createRole", "updateRole"],
      technicalMapping: {
        existingKeys: [P.ROLES_MANAGE],
        readiness: "partial",
        notes: "Metadata only; matrix writes use manage_permissions child.",
      },
    }),
    def({
      key: FN.roles.managePermissions,
      pageId: "roles",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.roles.viewPage,
      labels: { ar: "إدارة صلاحيات الأدوار", en: "Manage Role Permissions" },
      operationalActions: ["setRolePermissions"],
      technicalMapping: {
        existingKeys: [P.ROLES_MANAGE],
        readiness: "partial",
      },
    }),
  ];

const capabilityByKey = new Map(
  FUNCTIONAL_CAPABILITY_REGISTRY.map((item) => [item.key, item]),
);

export function getFunctionalCapability(
  key: string,
): FunctionalCapabilityDefinition | undefined {
  return capabilityByKey.get(key);
}

export function getFunctionalCapabilityOrThrow(
  key: string,
): FunctionalCapabilityDefinition {
  const found = getFunctionalCapability(key);
  if (!found) {
    throw new Error(`Unknown functional capability: ${key}`);
  }
  return found;
}

function buildPages(): FunctionalPageDefinition[] {
  const byPage = new Map<FunctionalPageId, FunctionalCapabilityDefinition[]>();
  for (const cap of FUNCTIONAL_CAPABILITY_REGISTRY) {
    const list = byPage.get(cap.pageId) ?? [];
    list.push(cap);
    byPage.set(cap.pageId, list);
  }
  const pages: FunctionalPageDefinition[] = [];
  for (const [id, caps] of byPage) {
    const model = caps[0]!.pageModel;
    const root =
      caps.find((c) => c.kind === "page_full_control" || c.kind === "page_parent")!;
    pages.push({
      id,
      model,
      rootCapabilityKey: root.key,
      capabilityKeys: caps.map((c) => c.key),
    });
  }
  pages.sort((a, b) => a.id.localeCompare(b.id));
  return pages;
}

export const FUNCTIONAL_PAGES: readonly FunctionalPageDefinition[] = buildPages();

export function getPageDefinition(
  pageId: FunctionalPageId,
): FunctionalPageDefinition {
  const page = FUNCTIONAL_PAGES.find((p) => p.id === pageId);
  if (!page) throw new Error(`Unknown functional page: ${pageId}`);
  return page;
}

export function getChildCapabilities(parentKey: string): FunctionalCapabilityDefinition[] {
  return FUNCTIONAL_CAPABILITY_REGISTRY.filter(
    (c) => c.parentKey === parentKey && c.kind === "child_action",
  );
}

export function getPageParentCapabilityKey(
  pageId: FunctionalPageId,
): string {
  const page = getPageDefinition(pageId);
  return page.rootCapabilityKey;
}
