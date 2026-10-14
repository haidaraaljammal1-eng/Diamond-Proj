import { ALL_FUNCTIONAL_CAPABILITY_KEYS, isFunctionalCapabilityKey } from "./keys.ts";
import {
  getChildCapabilities,
  getFunctionalCapability,
  getPageDefinition,
} from "./manifest.ts";
import type { FunctionalAuthContext, FunctionalPageId } from "./types.ts";

const KNOWN = new Set<string>(ALL_FUNCTIONAL_CAPABILITY_KEYS);

function sortedUnique(keys: Iterable<string>): string[] {
  return [...new Set(keys)].sort();
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

export function normalizeFunctionalGrants(input: readonly string[]): string[] {
  const working = new Set<string>();
  for (const key of input) {
    if (!KNOWN.has(key)) continue;
    working.add(key);
    for (const ancestor of collectAncestorKeys(key)) {
      working.add(ancestor);
    }
  }
  return sortedUnique(working);
}

export function removeFunctionalGrant(
  current: readonly string[],
  revokedKey: string,
): string[] {
  if (!isFunctionalCapabilityKey(revokedKey)) {
    return sortedUnique(current);
  }
  const toRemove = new Set<string>([revokedKey, ...collectDescendantKeys(revokedKey)]);
  return sortedUnique(current.filter((k) => !toRemove.has(k)));
}

function grantsInclude(ctx: FunctionalAuthContext, capabilityKey: string): boolean {
  if (ctx.isSystemAdmin) return true;
  return ctx.functionalGrants.includes(capabilityKey);
}

export function canViewFunctionalPage(
  ctx: FunctionalAuthContext,
  pageId: FunctionalPageId,
): boolean {
  if (ctx.isSystemAdmin) return true;
  const page = getPageDefinition(pageId);
  return grantsInclude(ctx, page.rootCapabilityKey);
}

export function canPerformFunctionalCapability(
  ctx: FunctionalAuthContext,
  capabilityKey: string,
): boolean {
  if (ctx.isSystemAdmin) return true;
  if (!isFunctionalCapabilityKey(capabilityKey)) return false;
  const cap = getFunctionalCapability(capabilityKey)!;
  if (!grantsInclude(ctx, capabilityKey)) return false;
  if (cap.kind === "child_action" && cap.parentKey) {
    return grantsInclude(ctx, cap.parentKey);
  }
  return true;
}

export function extractFunctionalGrantsFromPermissions(
  permissions: readonly string[],
): string[] {
  return sortedUnique(permissions.filter((key) => key.startsWith("diamond.fn.")));
}
