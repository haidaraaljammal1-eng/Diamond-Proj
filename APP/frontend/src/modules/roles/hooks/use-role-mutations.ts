"use client";

import {
  FN,
  isFunctionalRbacV2ModeMismatch,
  isFunctionalRbacV2UiEnabled,
  useLegacyOrFunctionalCapability,
} from "@/modules/functional-rbac";
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
  canManage: boolean;
  canEditRoleMetadata: boolean;
  canEditMatrix: boolean;
  /** Backend: `roles.manage` (classic) or system_admin only under V2. */
  canDeleteRole: boolean;
  matrixEditingDisabled: boolean;
  isSubmitting: boolean;
  error: ApiRequestError | null;
  clearError: () => void;
  createRole: (payload: CreateRolePayload) => Promise<boolean>;
  updateRole: (id: number, payload: UpdateRolePayload) => Promise<boolean>;
  deleteRole: (id: number) => Promise<boolean>;
  togglePermission: (
    roleId: number,
    permissionKey: string,
    next: boolean,
  ) => Promise<boolean>;
  toggleFunctionalGrant: (
    roleId: number,
    capabilityKey: string,
    next: boolean,
  ) => Promise<boolean>;
  isCellPending: (roleId: number, permissionKey: string) => boolean;
}

export function useRoleMutations(): UseRoleMutationsResult {
  const v2 = isFunctionalRbacV2UiEnabled();
  const mismatch = isFunctionalRbacV2ModeMismatch();
  const { isSystemAdmin } = usePermissions();
  const canManageLegacy = useLegacyOrFunctionalCapability(
    ROLES_MANAGE_PERMISSION,
    FN.roles.managePermissions,
  );
  const canEditRoleMetadata = useLegacyOrFunctionalCapability(
    ROLES_MANAGE_PERMISSION,
    FN.roles.createEdit,
  );
  const canManageMatrix = useLegacyOrFunctionalCapability(
    ROLES_MANAGE_PERMISSION,
    FN.roles.managePermissions,
  );

  const isSubmitting = useRolesPermissionsStore((state) => state.isSubmitting);
  const error = useRolesPermissionsStore((state) => state.submitError);
  const clearError = useRolesPermissionsStore((state) => state.clearSubmitError);
  const createRole = useRolesPermissionsStore((state) => state.createRole);
  const updateRole = useRolesPermissionsStore((state) => state.updateRole);
  const deleteRole = useRolesPermissionsStore((state) => state.deleteRole);
  const togglePermission = useRolesPermissionsStore(
    (state) => state.toggleRolePermission,
  );
  const toggleFunctionalGrant = useRolesPermissionsStore(
    (state) => state.toggleFunctionalGrant,
  );
  const pendingCells = useRolesPermissionsStore((state) => state.pendingCells);

  const matrixEditingDisabled = v2 && mismatch;
  const canManage = v2 ? canEditRoleMetadata : canManageLegacy;
  const canDeleteRole = v2 ? isSystemAdmin : canManageLegacy;

  return {
    canManage,
    canEditRoleMetadata: v2 ? canEditRoleMetadata : canManageLegacy,
    canEditMatrix: v2 ? canManageMatrix : canManageLegacy,
    canDeleteRole,
    matrixEditingDisabled,
    isSubmitting,
    error,
    clearError,
    createRole,
    updateRole,
    deleteRole,
    togglePermission,
    toggleFunctionalGrant,
    isCellPending: (roleId, permissionKey) =>
      pendingCells[cellKey(roleId, permissionKey)] === true,
  };
}
