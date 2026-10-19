import {
  ALL_FUNCTIONAL_CAPABILITY_KEYS,
  type FunctionalCapabilityKey,
} from "./keys";
import type { PermissionDefinition } from "src/constants/permissions";

/** Idempotent catalog rows for all `diamond.fn.*` keys (seeded with legacy 117). */
export function buildFunctionalPermissionCatalogEntries(): PermissionDefinition[] {
  return ALL_FUNCTIONAL_CAPABILITY_KEYS.map((key: FunctionalCapabilityKey) => ({
    key,
    category: "functional_v2",
    description: `RBAC V2 functional capability: ${key}`,
  }));
}
