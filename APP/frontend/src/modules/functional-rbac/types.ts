export type FunctionalPageId =
  | "dashboard"
  | "vehicles"
  | "gps"
  | "maintenance"
  | "archive"
  | "violations"
  | "finance"
  | "invoices"
  | "contracts"
  | "whatsapp"
  | "users"
  | "roles";

export type FunctionalCapabilityKind =
  | "page_full_control"
  | "page_parent"
  | "child_action";

export type FunctionalPageModel = "single_full_control" | "parent_child";

export interface FunctionalCapabilityDefinition {
  key: string;
  pageId: FunctionalPageId;
  kind: FunctionalCapabilityKind;
  pageModel: FunctionalPageModel;
  parentKey: string | null;
  labels: { ar: string; en: string };
}

export interface FunctionalPageDefinition {
  id: FunctionalPageId;
  model: FunctionalPageModel;
  rootCapabilityKey: string;
  capabilityKeys: readonly string[];
}

export interface FunctionalAuthContext {
  isSystemAdmin: boolean;
  functionalGrants: readonly string[];
}
