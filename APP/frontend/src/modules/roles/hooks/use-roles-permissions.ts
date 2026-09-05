"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useRolesPermissionsStore } from "../stores/roles-permissions.store";
import { buildPermissionMatrix } from "../utils/permission-matrix";
import type { PermissionMatrix } from "../utils/permission-matrix";
import { ROLES_PAGE_PERMISSIONS } from "../roles.permissions";

export interface UseRolesPermissionsResult {
  /** Derived render model: role columns × permission rows. */
  matrix: PermissionMatrix;
  /** True while the user holds every Backend permission the page reads. */
  isAllowed: boolean;
  isLoading: boolean;
  /** Data has landed at least once. */
  isReady: boolean;
  error: ApiRequestError | null;
  /** `true` when the role grants the permission. */
  hasPermission: (roleId: number, permissionKey: string) => boolean;
  refresh: () => Promise<void>;
}

/**
 * The UI facade for the Roles page. Components never touch the store or the
 * API layer; they only see this interface.
 *
 * Nothing is requested when the session lacks the Backend permissions the page
 * reads — the Backend would reject it anyway, and a 403 is not a UX.
 */
export function useRolesPermissions(): UseRolesPermissionsResult {
  const { hasPermission: sessionHasPermission } = usePermissions();
  const roles = useRolesPermissionsStore((state) => state.roles);
  const permissions = useRolesPermissionsStore((state) => state.permissions);
  const status = useRolesPermissionsStore((state) => state.status);
  const error = useRolesPermissionsStore((state) => state.error);
  const load = useRolesPermissionsStore((state) => state.load);
  const refresh = useRolesPermissionsStore((state) => state.refresh);

  const isAllowed = ROLES_PAGE_PERMISSIONS.every((permission) =>
    sessionHasPermission(permission),
  );

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const matrix = useMemo(
    () => buildPermissionMatrix(roles, permissions),
    [roles, permissions],
  );

  return {
    matrix,
    isAllowed,
    isLoading: status === "loading" || (isAllowed && status === "idle"),
    isReady: status === "ready",
    error: status === "error" ? error : null,
    hasPermission: matrix.hasPermission,
    refresh,
  };
}
