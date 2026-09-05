"use client";

import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  cellKey,
  useRolesPermissionsStore,
} from "../stores/roles-permissions.store";
import type {
  CreateRolePayload,
  UpdateRolePayload,
} from "../api/roles.api";
import { ROLES_MANAGE_PERMISSION } from "../roles.permissions";

export interface UseRoleMutationsResult {
  /** The session holds the Backend permission for role writes. */
  canManage: boolean;
  isSubmitting: boolean;
  error: ApiRequestError | null;
  clearError: () => void;
  /** Both resolve to `true` only when the Backend accepted the write. */
  createRole: (payload: CreateRolePayload) => Promise<boolean>;
  updateRole: (id: number, payload: UpdateRolePayload) => Promise<boolean>;
  /** Grants or revokes one permission and saves it immediately. */
  togglePermission: (
    roleId: number,
    permissionKey: string,
    next: boolean,
  ) => Promise<boolean>;
  /** That cell's write is still in flight. */
  isCellPending: (roleId: number, permissionKey: string) => boolean;
}

/**
 * Role writes, kept separate from the read hook because the Backend gates them
 * behind their own permission (`roles.manage`). The dialogs use this facade;
 * they never touch the store or the API layer.
 */
export function useRoleMutations(): UseRoleMutationsResult {
  const { hasPermission } = usePermissions();
  const isSubmitting = useRolesPermissionsStore((state) => state.isSubmitting);
  const error = useRolesPermissionsStore((state) => state.submitError);
  const clearError = useRolesPermissionsStore((state) => state.clearSubmitError);
  const createRole = useRolesPermissionsStore((state) => state.createRole);
  const updateRole = useRolesPermissionsStore((state) => state.updateRole);
  const togglePermission = useRolesPermissionsStore(
    (state) => state.toggleRolePermission,
  );
  const pendingCells = useRolesPermissionsStore((state) => state.pendingCells);

  return {
    canManage: hasPermission(ROLES_MANAGE_PERMISSION),
    isSubmitting,
    error,
    clearError,
    createRole,
    updateRole,
    togglePermission,
    isCellPending: (roleId, permissionKey) =>
      pendingCells[cellKey(roleId, permissionKey)] === true,
  };
}
