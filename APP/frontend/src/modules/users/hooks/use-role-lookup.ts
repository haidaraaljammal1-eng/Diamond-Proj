"use client";

import { useEffect } from "react";
import { usePermissions } from "@/modules/auth";
import { ROLES_READ_PERMISSION } from "@/modules/roles/roles.permissions";
import { useRoleLookupStore } from "../stores/role-lookup.store";

export interface UseRoleLookupResult {
  roles: ReturnType<typeof useRoleLookupStore.getState>["roles"];
  isLoading: boolean;
  isAllowed: boolean;
}

/** Loads assignable roles when the session holds `roles.read`. */
export function useRoleLookup(enabled = true): UseRoleLookupResult {
  const { hasPermission } = usePermissions();
  const isAllowed = hasPermission(ROLES_READ_PERMISSION);
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
