"use client";

import { useEffect, useMemo } from "react";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  ALL_FUNCTIONAL_CAPABILITY_KEYS,
  isFunctionalRbacV2UiEnabled,
  useDiamondPageAccess,
} from "@/modules/functional-rbac";
import { useRolesPermissionsStore } from "../stores/roles-permissions.store";
import { buildPermissionMatrix } from "../utils/permission-matrix";
import type { PermissionMatrix } from "../utils/permission-matrix";
import { buildFunctionalPermissionMatrix } from "../utils/build-functional-matrix";
import type { FunctionalPermissionMatrix } from "../utils/build-functional-matrix";
import { filterPermissionsForMatrixDisplay } from "../utils/roles-display-permissions";

export interface UseRolesPermissionsResult {
  matrix: PermissionMatrix;
  functionalMatrix: FunctionalPermissionMatrix;
  useFunctionalMatrix: boolean;
  isAllowed: boolean;
  isLoading: boolean;
  isReady: boolean;
  error: ApiRequestError | null;
  hasPermission: (roleId: number, permissionKey: string) => boolean;
  refresh: () => Promise<void>;
}

export function useRolesPermissions(): UseRolesPermissionsResult {
  const useFunctionalMatrix = isFunctionalRbacV2UiEnabled();
  const isAllowed = useDiamondPageAccess("roles");
  const roles = useRolesPermissionsStore((state) => state.roles);
  const permissions = useRolesPermissionsStore((state) => state.permissions);
  const status = useRolesPermissionsStore((state) => state.status);
  const error = useRolesPermissionsStore((state) => state.error);
  const load = useRolesPermissionsStore((state) => state.load);
  const refresh = useRolesPermissionsStore((state) => state.refresh);

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const matrixPermissions = useMemo(
    () => filterPermissionsForMatrixDisplay(permissions),
    [permissions],
  );

  const matrix = useMemo(
    () => buildPermissionMatrix(roles, matrixPermissions),
    [roles, matrixPermissions],
  );

  const functionalMatrix = useMemo(
    () => buildFunctionalPermissionMatrix(roles),
    [roles],
  );

  const displayMatrix = useFunctionalMatrix
    ? buildPermissionMatrix(roles, [])
    : matrix;

  return {
    matrix: displayMatrix,
    functionalMatrix,
    useFunctionalMatrix,
    isAllowed,
    isLoading: status === "loading" || (isAllowed && status === "idle"),
    isReady: status === "ready",
    error: status === "error" ? error : null,
    hasPermission: useFunctionalMatrix
      ? functionalMatrix.hasGrant
      : matrix.hasPermission,
    refresh,
  };
}

export const FUNCTIONAL_MATRIX_INVARIANTS = {
  pageGroups: 12,
  capabilities: ALL_FUNCTIONAL_CAPABILITY_KEYS.length,
};
