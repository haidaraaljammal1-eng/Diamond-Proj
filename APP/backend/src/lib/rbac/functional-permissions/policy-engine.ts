import {
  FUNCTIONAL_CAPABILITY_REGISTRY,
  FUNCTIONAL_PAGES,
  getChildCapabilities,
  getFunctionalCapability,
  getPageDefinition,
  getPageParentCapabilityKey,
} from "./registry";
import { ALL_FUNCTIONAL_CAPABILITY_KEYS } from "./keys";
import type {
  CapabilityDependencyMetadata,
  FunctionalAuthContext,
  FunctionalCapabilityDefinition,
  FunctionalGrantValidationIssue,
  FunctionalPageId,
  NormalizeFunctionalGrantsResult,
} from "./types";

const KNOWN = new Set<string>(ALL_FUNCTIONAL_CAPABILITY_KEYS);

function sortedUnique(keys: Iterable<string>): string[] {
  return [...new Set(keys)].sort();
}

function isKnownCapability(key: string): boolean {
  return KNOWN.has(key);
}

/** All registry capability keys (deterministic order). */
export function listFunctionalCapabilityKeys(): readonly string[] {
  return ALL_FUNCTIONAL_CAPABILITY_KEYS;
}

/** Resolve the page root (parent or full-control) for a capability. */
export function resolvePageParentPermission(capabilityKey: string): string | null {
  const cap = getFunctionalCapability(capabilityKey);
  if (!cap) return null;
  if (cap.kind === "page_full_control" || cap.kind === "page_parent") {
    return cap.key;
  }
  return cap.parentKey;
}

function collectAncestorKeys(capabilityKey: string): string[] {
  const ancestors: string[] = [];
  let current = getFunctionalCapability(capabilityKey);
  while (current?.parentKey) {
    ancestors.push(current.parentKey);
    current = getFunctionalCapability(current.parentKey);
  }
  return ancestors;
}

function collectDescendantKeys(rootKey: string): string[] {
  const out: string[] = [];
  const queue = [rootKey];
  while (queue.length > 0) {
    const key = queue.shift()!;
    for (const child of getChildCapabilities(key)) {
      out.push(child.key);
      queue.push(child.key);
    }
  }
  return out;
}

function validateStructuralConsistency(
  grants: readonly string[],
): FunctionalGrantValidationIssue[] {
  const issues: FunctionalGrantValidationIssue[] = [];
  const set = new Set(grants);
  for (const key of grants) {
    if (!isKnownCapability(key)) {
      issues.push({
        code: "UNKNOWN_CAPABILITY",
        key,
        message: `Unknown functional capability: ${key}`,
      });
      continue;
    }
    const cap = getFunctionalCapability(key)!;
    if (cap.kind === "child_action" && cap.parentKey && !set.has(cap.parentKey)) {
      issues.push({
        code: "ORPHAN_CHILD",
        key,
        message: `Child ${key} requires parent ${cap.parentKey}`,
      });
    }
  }
  return issues;
}

/**
 * Normalize grants: dedupe, auto-include parents for children, reject unknown keys.
 * Does not add children when parent is granted (parent-only stays parent-only).
 */
export function normalizeFunctionalGrants(
  input: readonly string[],
): NormalizeFunctionalGrantsResult {
  const issues: FunctionalGrantValidationIssue[] = [];
  const working = new Set<string>();

  for (const key of input) {
    if (!isKnownCapability(key)) {
      issues.push({
        code: "UNKNOWN_CAPABILITY",
        key,
        message: `Unknown functional capability: ${key}`,
      });
      continue;
    }
    working.add(key);
    for (const ancestor of collectAncestorKeys(key)) {
      working.add(ancestor);
    }
  }

  const normalized = sortedUnique(working);
  issues.push(...validateStructuralConsistency(normalized));

  const orphanIssues = issues.filter((i) => i.code === "ORPHAN_CHILD");
  return {
    ok: issues.length === 0,
    normalized: orphanIssues.length > 0 ? [] : normalized,
    issues,
  };
}

/**
 * Apply explicit parent removal: drops the parent and every descendant on that page branch.
 */
export function removeFunctionalGrant(
  current: readonly string[],
  revokedKey: string,
): string[] {
  if (!isKnownCapability(revokedKey)) {
    return sortedUnique(current);
  }
  const toRemove = new Set<string>([revokedKey, ...collectDescendantKeys(revokedKey)]);
  return sortedUnique(current.filter((k) => !toRemove.has(k)));
}

export function validateFunctionalGrants(
  grants: readonly string[],
): NormalizeFunctionalGrantsResult {
  return normalizeFunctionalGrants(grants);
}

function grantsInclude(ctx: FunctionalAuthContext, capabilityKey: string): boolean {
  if (ctx.isSystemAdmin) return true;
  return ctx.functionalGrants.includes(capabilityKey);
}

/** TYPE A: single key grants full page control. TYPE B: requires page parent (or child with normalized parent). */
export function canViewFunctionalPage(
  ctx: FunctionalAuthContext,
  pageId: FunctionalPageId,
): boolean {
  if (ctx.isSystemAdmin) return true;
  const page = getPageDefinition(pageId);
  if (page.model === "single_full_control") {
    return grantsInclude(ctx, page.rootCapabilityKey);
  }
  return grantsInclude(ctx, page.rootCapabilityKey);
}

/**
 * Authorize a functional business capability. Fail-closed for non-admin users.
 * Parent-only grants do not satisfy child capabilities.
 */
export function canPerformFunctionalCapability(
  ctx: FunctionalAuthContext,
  capabilityKey: string,
): boolean {
  if (ctx.isSystemAdmin) return true;
  if (!isKnownCapability(capabilityKey)) return false;
  const cap = getFunctionalCapability(capabilityKey)!;
  if (!grantsInclude(ctx, capabilityKey)) return false;
  if (cap.kind === "child_action" && cap.parentKey) {
    return grantsInclude(ctx, cap.parentKey);
  }
  return true;
}

/** Single-page full-control: the root capability implies all actions on that page. */
export function isSinglePageFullControlCapability(
  capabilityKey: string,
): boolean {
  const cap = getFunctionalCapability(capabilityKey);
  return cap?.kind === "page_full_control" && cap.pageModel === "single_full_control";
}

export function canPerformFunctionalCapabilityOnPage(
  ctx: FunctionalAuthContext,
  pageId: FunctionalPageId,
  capabilityKey: string,
): boolean {
  const cap = getFunctionalCapability(capabilityKey);
  if (!cap || cap.pageId !== pageId) return false;
  if (cap.kind === "page_full_control") {
    return canPerformFunctionalCapability(ctx, capabilityKey);
  }
  return canPerformFunctionalCapability(ctx, capabilityKey);
}

/** System administrator unconditional RBAC override (functional layer). */
export function isSystemAdminFunctionalOverride(ctx: FunctionalAuthContext): boolean {
  return ctx.isSystemAdmin === true;
}

/**
 * Dependency metadata for Phase 2 route/lookup integration.
 * Phase 1: `impliedPersistedLegacyKeys` is always empty (no broad auto-grants).
 */
export function getCapabilityDependencyMetadata(
  capabilityKey: string,
): CapabilityDependencyMetadata | null {
  const cap = getFunctionalCapability(capabilityKey);
  if (!cap) return null;
  return {
    capabilityKey,
    technicalMapping: cap.technicalMapping,
    contextualLookups: cap.contextualLookups ?? [],
    impliedPersistedLegacyKeys: [],
  };
}

/** Registry self-check (unit tests). */
export function assertFunctionalRegistryInvariants(): void {
  const keys = FUNCTIONAL_CAPABILITY_REGISTRY.map((c) => c.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error("Duplicate functional capability keys in registry");
  }
  if (FUNCTIONAL_PAGES.length !== 12) {
    throw new Error(`Expected 12 functional pages, got ${FUNCTIONAL_PAGES.length}`);
  }
  for (const page of FUNCTIONAL_PAGES) {
    if (page.model === "single_full_control") {
      const full = page.capabilityKeys.filter((k) => {
        const c = getFunctionalCapability(k);
        return c?.kind === "page_full_control";
      });
      if (full.length !== 1) {
        throw new Error(`Page ${page.id} must have exactly one full-control capability`);
      }
    } else {
      const parent = getFunctionalCapability(page.rootCapabilityKey);
      if (!parent || parent.kind !== "page_parent") {
        throw new Error(`Page ${page.id} missing page_parent root`);
      }
    }
  }
  for (const cap of FUNCTIONAL_CAPABILITY_REGISTRY) {
    if (cap.parentKey) {
      const parent = getFunctionalCapability(cap.parentKey);
      if (!parent) {
        throw new Error(`Missing parent ${cap.parentKey} for ${cap.key}`);
      }
      if (parent.pageId !== cap.pageId) {
        throw new Error(`Cross-page parent link: ${cap.key}`);
      }
    }
  }
}

export function getCapabilitiesForPage(
  pageId: FunctionalPageId,
): readonly FunctionalCapabilityDefinition[] {
  return FUNCTIONAL_CAPABILITY_REGISTRY.filter((c) => c.pageId === pageId);
}

export function resolvePageParentForPageId(pageId: FunctionalPageId): string {
  return getPageParentCapabilityKey(pageId);
}
