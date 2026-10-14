import type { PermissionKey } from "src/constants/permissions";

/** Twelve owner-approved Diamond staff pages. */
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

export type PageModel = "single_full_control" | "parent_child";

export type CapabilityKind =
  | "page_full_control"
  | "page_parent"
  | "child_action";

/** Whether routes can enforce this mapping today without catalog/route changes. */
export type EnforcementReadiness = "ready" | "partial" | "deferred";

/**
 * Task-scoped lookup dependency — metadata for Phase 2+ contextual enforcement.
 * Phase 1 never auto-persists these grants.
 */
export interface ContextualLookupDependency {
  description: string;
  lookupPermission: PermissionKey;
  requiredCapability: string;
}

export interface TechnicalMapping {
  /** Existing `PERMISSIONS` catalog keys (117) — mapping reference only in Phase 1. */
  existingKeys: readonly PermissionKey[];
  /** Keys not yet in `PERMISSION_CATALOG` — Phase 2+ */
  proposedKeys?: readonly string[];
  readiness: EnforcementReadiness;
  notes?: string;
}

export interface FunctionalCapabilityDefinition {
  /** Stable functional key (`diamond.fn.*`). Not stored in DB during Phase 1. */
  key: string;
  pageId: FunctionalPageId;
  kind: CapabilityKind;
  pageModel: PageModel;
  /** `null` for page roots (parent or full-control). */
  parentKey: string | null;
  labels: { ar: string; en: string };
  /** Representative backend operationIds / workflow steps (documentation). */
  operationalActions: readonly string[];
  technicalMapping: TechnicalMapping;
  contextualLookups?: readonly ContextualLookupDependency[];
}

export interface FunctionalPageDefinition {
  id: FunctionalPageId;
  model: PageModel;
  /** Root capability key for the page (parent or full-control). */
  rootCapabilityKey: string;
  capabilityKeys: readonly string[];
}

export interface FunctionalAuthContext {
  /** Normalized functional grants (use `normalizeFunctionalGrants` before checks). */
  functionalGrants: readonly string[];
  isSystemAdmin: boolean;
}

export type FunctionalGrantValidationErrorCode =
  | "UNKNOWN_CAPABILITY"
  | "ORPHAN_CHILD"
  | "DUPLICATE_GRANT";

export interface FunctionalGrantValidationIssue {
  code: FunctionalGrantValidationErrorCode;
  key: string;
  message: string;
}

export interface NormalizeFunctionalGrantsResult {
  ok: boolean;
  normalized: string[];
  issues: FunctionalGrantValidationIssue[];
}

export interface CapabilityDependencyMetadata {
  capabilityKey: string;
  technicalMapping: TechnicalMapping;
  contextualLookups: readonly ContextualLookupDependency[];
  /**
   * Phase 1: always empty — broad legacy keys are never implied for persistence.
   */
  impliedPersistedLegacyKeys: readonly PermissionKey[];
}
