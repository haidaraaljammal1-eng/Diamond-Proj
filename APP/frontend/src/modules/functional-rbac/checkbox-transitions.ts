import { getFunctionalCapability } from "./manifest.ts";
import { normalizeFunctionalGrants, removeFunctionalGrant } from "./policy-engine.ts";

/**
 * Pure UI transition for matrix checkboxes (TYPE A + TYPE B).
 * Server still normalizes on save; this keeps the editor consistent locally.
 */
export function applyFunctionalGrantToggle(
  currentFunctionalGrants: readonly string[],
  capabilityKey: string,
  checked: boolean,
): string[] {
  const cap = getFunctionalCapability(capabilityKey);
  if (!cap) return [...currentFunctionalGrants];

  if (!checked) {
    return removeFunctionalGrant(currentFunctionalGrants, capabilityKey);
  }

  const next = new Set(currentFunctionalGrants);
  next.add(capabilityKey);
  return normalizeFunctionalGrants([...next]);
}

export function roleHasFunctionalGrant(
  grants: readonly string[],
  capabilityKey: string,
): boolean {
  return grants.includes(capabilityKey);
}
