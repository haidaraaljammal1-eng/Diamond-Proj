"use client";

import { useCallback } from "react";
import { usePermissions } from "@/modules/auth";
import {
  actorMayDelegateFunctionalGrantToggle,
  useFunctionalAuthContext,
} from "@/modules/functional-rbac";
import type { RoleDto } from "../types/role.types";

export function useFunctionalMatrixDelegation() {
  const ctx = useFunctionalAuthContext();
  const { hasPermission } = usePermissions();

  return useCallback(
    (role: RoleDto, capabilityKey: string, enabled: boolean) =>
      actorMayDelegateFunctionalGrantToggle(
        ctx,
        role.permissions,
        capabilityKey,
        enabled,
        hasPermission,
      ),
    [ctx, hasPermission],
  );
}
