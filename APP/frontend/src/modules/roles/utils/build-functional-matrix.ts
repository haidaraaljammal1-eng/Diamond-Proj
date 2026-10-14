import { SYSTEM_ADMIN_ROLE } from "@/modules/navigation/navigation.types";
import {
  FUNCTIONAL_CAPABILITY_REGISTRY,
  FUNCTIONAL_PAGE_ORDER,
  extractFunctionalGrantsFromPermissions,
  getFunctionalCapability,
  type FunctionalPageId,
} from "@/modules/functional-rbac";
import type { RoleDto } from "../types/role.types";

export interface FunctionalMatrixGroup {
  pageId: FunctionalPageId;
  capabilities: typeof FUNCTIONAL_CAPABILITY_REGISTRY;
}

export interface FunctionalPermissionMatrix {
  roles: RoleDto[];
  groups: FunctionalMatrixGroup[];
  capabilityCount: number;
  hasGrant: (roleId: number, capabilityKey: string) => boolean;
  grantCountFor: (roleId: number) => number;
  isFullAccessRole: (role: RoleDto) => boolean;
}

export function buildFunctionalPermissionMatrix(
  roles: RoleDto[],
): FunctionalPermissionMatrix {
  const grantsByRole = new Map<number, Set<string>>(
    roles.map((role) => [
      role.id,
      new Set(extractFunctionalGrantsFromPermissions(role.permissions)),
    ]),
  );

  const groups: FunctionalMatrixGroup[] = FUNCTIONAL_PAGE_ORDER.map((pageId) => ({
    pageId,
    capabilities: FUNCTIONAL_CAPABILITY_REGISTRY.filter((c) => c.pageId === pageId),
  }));

  const capabilityCount = FUNCTIONAL_CAPABILITY_REGISTRY.length;

  return {
    roles,
    groups,
    capabilityCount,
    hasGrant: (roleId, capabilityKey) =>
      grantsByRole.get(roleId)?.has(capabilityKey) ?? false,
    grantCountFor: (roleId) => grantsByRole.get(roleId)?.size ?? 0,
    isFullAccessRole: (role) =>
      role.key === SYSTEM_ADMIN_ROLE || role.isSystem,
  };
}

export function isChildCapabilityRow(capabilityKey: string): boolean {
  const cap = getFunctionalCapability(capabilityKey);
  return cap?.kind === "child_action";
}
