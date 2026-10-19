import { FN } from "./keys.ts";
import type {
  FunctionalCapabilityDefinition,
  FunctionalPageDefinition,
  FunctionalPageId,
} from "./types.ts";

/** Owner-approved display order (12 operational page groups). */
export const FUNCTIONAL_PAGE_ORDER: readonly FunctionalPageId[] = [
  "dashboard",
  "vehicles",
  "gps",
  "maintenance",
  "archive",
  "violations",
  "finance",
  "invoices",
  "contracts",
  "whatsapp",
  "users",
  "roles",
];

function def(
  entry: FunctionalCapabilityDefinition,
): FunctionalCapabilityDefinition {
  return entry;
}

/** Labels mirror backend `registry.ts` (authoritative contract). */
export const FUNCTIONAL_CAPABILITY_REGISTRY: readonly FunctionalCapabilityDefinition[] =
  [
    def({
      key: FN.dashboard.full,
      pageId: "dashboard",
      kind: "page_full_control",
      pageModel: "single_full_control",
      parentKey: null,
      labels: { ar: "عرض الصفحة والتحكم الكامل", en: "View Page & Full Control" },
    }),
    def({
      key: FN.vehicles.viewPage,
      pageId: "vehicles",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض المركبات", en: "View Vehicles" },
    }),
    def({
      key: FN.vehicles.addDelete,
      pageId: "vehicles",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.vehicles.viewPage,
      labels: { ar: "إضافة وحذف مركبة", en: "Add & Delete Vehicle" },
    }),
    def({
      key: FN.vehicles.editPrices,
      pageId: "vehicles",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.vehicles.viewPage,
      labels: { ar: "تعديل أسعار المركبة", en: "Edit Vehicle Prices" },
    }),
    def({
      key: FN.gps.full,
      pageId: "gps",
      kind: "page_full_control",
      pageModel: "single_full_control",
      parentKey: null,
      labels: { ar: "عرض الصفحة والتحكم الكامل", en: "View Page & Full Control" },
    }),
    def({
      key: FN.maintenance.viewPage,
      pageId: "maintenance",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
    }),
    def({
      key: FN.maintenance.create,
      pageId: "maintenance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.maintenance.viewPage,
      labels: { ar: "إنشاء أمر صيانة", en: "Create Maintenance Order" },
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
    }),
    def({
      key: FN.violations.viewPage,
      pageId: "violations",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
    }),
    def({
      key: FN.violations.manualCollection,
      pageId: "violations",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.violations.viewPage,
      labels: { ar: "التحصيل اليدوي", en: "Manual Collection" },
    }),
    def({
      key: FN.finance.viewPage,
      pageId: "finance",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
    }),
    def({
      key: FN.finance.addExpense,
      pageId: "finance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.finance.viewPage,
      labels: { ar: "إضافة مصروف", en: "Add Expense" },
    }),
    def({
      key: FN.finance.correctExpense,
      pageId: "finance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.finance.viewPage,
      labels: { ar: "تصحيح مصروف", en: "Correct Expense" },
    }),
    def({
      key: FN.finance.voidExpense,
      pageId: "finance",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.finance.viewPage,
      labels: { ar: "إبطال مصروف", en: "Void Expense" },
    }),
    def({
      key: FN.invoices.viewPage,
      pageId: "invoices",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
    }),
    def({
      key: FN.invoices.downloadPdf,
      pageId: "invoices",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.invoices.viewPage,
      labels: { ar: "تنزيل PDF", en: "Download PDF" },
    }),
    def({
      key: FN.invoices.sendWhatsapp,
      pageId: "invoices",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.invoices.viewPage,
      labels: { ar: "إرسال الفاتورة عبر واتساب", en: "Send Invoice via WhatsApp" },
    }),
    def({
      key: FN.contracts.viewPage,
      pageId: "contracts",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
    }),
    def({
      key: FN.contracts.rentalLink,
      pageId: "contracts",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.contracts.viewPage,
      labels: { ar: "إنشاء رابط تأجير", en: "Create Rental Link" },
    }),
    def({
      key: FN.contracts.operationsClosure,
      pageId: "contracts",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.contracts.viewPage,
      labels: {
        ar: "تسليم وإرجاع وتسوية وإغلاق العقد",
        en: "Delivery, Return, Reconciliation & Closure",
      },
    }),
    def({
      key: FN.contracts.renewal,
      pageId: "contracts",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.contracts.viewPage,
      labels: { ar: "تجديد العقد", en: "Contract Renewal" },
    }),
    def({
      key: FN.whatsapp.full,
      pageId: "whatsapp",
      kind: "page_full_control",
      pageModel: "single_full_control",
      parentKey: null,
      labels: { ar: "عرض الصفحة والتحكم الكامل", en: "View Page & Full Control" },
    }),
    def({
      key: FN.users.viewPage,
      pageId: "users",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
    }),
    def({
      key: FN.users.create,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "إنشاء مستخدم", en: "Create User" },
    }),
    def({
      key: FN.users.edit,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "تعديل مستخدم", en: "Edit User" },
    }),
    def({
      key: FN.users.enableDisable,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "تفعيل / تعطيل مستخدم", en: "Enable / Disable User" },
    }),
    def({
      key: FN.users.delete,
      pageId: "users",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.users.viewPage,
      labels: { ar: "حذف مستخدم", en: "Delete User" },
    }),
    def({
      key: FN.roles.viewPage,
      pageId: "roles",
      kind: "page_parent",
      pageModel: "parent_child",
      parentKey: null,
      labels: { ar: "عرض الصفحة", en: "View Page" },
    }),
    def({
      key: FN.roles.createEdit,
      pageId: "roles",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.roles.viewPage,
      labels: { ar: "إنشاء / تعديل الأدوار", en: "Create / Edit Roles" },
    }),
    def({
      key: FN.roles.managePermissions,
      pageId: "roles",
      kind: "child_action",
      pageModel: "parent_child",
      parentKey: FN.roles.viewPage,
      labels: { ar: "إدارة صلاحيات الأدوار", en: "Manage Role Permissions" },
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

export function getChildCapabilities(
  parentKey: string,
): FunctionalCapabilityDefinition[] {
  return FUNCTIONAL_CAPABILITY_REGISTRY.filter(
    (c) => c.parentKey === parentKey && c.kind === "child_action",
  );
}

function buildPages(): FunctionalPageDefinition[] {
  const byPage = new Map<FunctionalPageId, FunctionalCapabilityDefinition[]>();
  for (const cap of FUNCTIONAL_CAPABILITY_REGISTRY) {
    const list = byPage.get(cap.pageId) ?? [];
    list.push(cap);
    byPage.set(cap.pageId, list);
  }
  const pages: FunctionalPageDefinition[] = [];
  for (const id of FUNCTIONAL_PAGE_ORDER) {
    const caps = byPage.get(id);
    if (!caps?.length) continue;
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
  return pages;
}

export const FUNCTIONAL_PAGES: readonly FunctionalPageDefinition[] = buildPages();

export function getPageDefinition(pageId: FunctionalPageId): FunctionalPageDefinition {
  const page = FUNCTIONAL_PAGES.find((p) => p.id === pageId);
  if (!page) throw new Error(`Unknown functional page: ${pageId}`);
  return page;
}
