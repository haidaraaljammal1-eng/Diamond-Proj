"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import {
  FN,
  isFunctionalRbacV2UiEnabled,
  useLegacyOrFunctionalCapability,
} from "@/modules/functional-rbac";
import { ROLES_READ_PERMISSION } from "@/modules/roles/roles.permissions";
import {
  USERS_CREATE_PERMISSION,
  USERS_UPDATE_PERMISSION,
} from "../users.permissions";
import { useRoleLookupStore } from "../stores/role-lookup.store";

export interface UseRoleLookupResult {
  roles: ReturnType<typeof useRoleLookupStore.getState>["roles"];
  isLoading: boolean;
  isAllowed: boolean;
}

/**
 * Loads assignable roles from `GET /lookups/roles`. Mirrors the Backend's
 * any-of gate: `roles.read` OR `users.create` OR `users.update` — assigning a
 * role inside the user form must not require access to the Roles page.
 */
export function useRoleLookup(enabled = true): UseRoleLookupResult {
  const v2 = isFunctionalRbacV2UiEnabled();
  const { hasPermission } = usePermissions();
  const canCreate = useLegacyOrFunctionalCapability(
    USERS_CREATE_PERMISSION,
    FN.users.create,
  );
  const canEdit = useLegacyOrFunctionalCapability(
    USERS_UPDATE_PERMISSION,
    FN.users.edit,
  );
  const isAllowed = useMemo(
    () =>
      v2
        ? canCreate || canEdit
        : hasPermission(ROLES_READ_PERMISSION) ||
          hasPermission(USERS_CREATE_PERMISSION) ||
          hasPermission(USERS_UPDATE_PERMISSION),
    [v2, canCreate, canEdit, hasPermission],
  );
  const roles = useRoleLookupStore((state) => state.roles);
  const status = useRoleLookupStore((state) => state.status);
  const load = useRoleLookupStore((state) => state.load);

  useEffect(() => {
    if (enabled && isAllowed) void load();
  }, [enabled, isAllowed, load]);

  return {
    roles: isAllowed ? roles : [],
    isLoading: isAllowed && (status === "loading" || status === "idle"),
    isAllowed,
  };
}
