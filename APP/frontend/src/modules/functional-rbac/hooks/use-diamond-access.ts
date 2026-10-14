"use client";

import { useCallback, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import { isFunctionalRbacV2UiEnabled } from "../feature-flag";
import { LEGACY_PAGE_PERMISSIONS } from "../legacy-bridge";
import {
  canPerformFunctionalCapability,
  canViewFunctionalPage,
} from "../policy-engine";
import type { FunctionalPageId } from "../types";
import { useFunctionalAuthContext } from "./use-functional-auth";

export function useDiamondPageAccess(pageId: FunctionalPageId): boolean {
  const v2 = isFunctionalRbacV2UiEnabled();
  const ctx = useFunctionalAuthContext();
  const { hasPermission } = usePermissions();

  return useMemo(() => {
    if (v2) return canViewFunctionalPage(ctx, pageId);
    const legacy = LEGACY_PAGE_PERMISSIONS[pageId];
    return legacy.every((permission) => hasPermission(permission));
  }, [v2, ctx, pageId, hasPermission]);
}

export function useDiamondCapability(
  functionalCapabilityKey: string,
  legacyPermission: string,
): boolean {
  return useLegacyOrFunctionalCapability(legacyPermission, functionalCapabilityKey);
}

/**
 * When V2 UI is off, checks a legacy catalog permission.
 * When V2 UI is on, checks the functional capability (fail-closed if unknown).
 */
export function useLegacyAnyOrFunctionalCapability(
  legacyPermissions: readonly string[],
  functionalCapabilityKey: string,
): boolean {
  const v2 = isFunctionalRbacV2UiEnabled();
  const ctx = useFunctionalAuthContext();
  const { hasPermission } = usePermissions();

  return useMemo(() => {
    if (v2) return canPerformFunctionalCapability(ctx, functionalCapabilityKey);
    return legacyPermissions.some((permission) => hasPermission(permission));
  }, [v2, ctx, legacyPermissions, functionalCapabilityKey, hasPermission]);
}

export function useLegacyOrFunctionalCapability(
  legacyPermission: string,
  functionalCapabilityKey: string,
): boolean {
  const v2 = isFunctionalRbacV2UiEnabled();
  const ctx = useFunctionalAuthContext();
  const { hasPermission } = usePermissions();

  return useMemo(() => {
    if (v2) return canPerformFunctionalCapability(ctx, functionalCapabilityKey);
    return hasPermission(legacyPermission);
  }, [v2, ctx, legacyPermission, functionalCapabilityKey, hasPermission]);
}

export function useDiamondAccessHelpers() {
  const v2 = isFunctionalRbacV2UiEnabled();
  const ctx = useFunctionalAuthContext();
  const { hasPermission } = usePermissions();

  const canViewPage = useCallback(
    (pageId: FunctionalPageId) => {
      if (v2) return canViewFunctionalPage(ctx, pageId);
      return LEGACY_PAGE_PERMISSIONS[pageId].every((p) => hasPermission(p));
    },
    [v2, ctx, hasPermission],
  );

  const canPerform = useCallback(
    (capabilityKey: string, legacyPermission?: string) => {
      if (v2) return canPerformFunctionalCapability(ctx, capabilityKey);
      return legacyPermission ? hasPermission(legacyPermission) : false;
    },
    [v2, ctx, hasPermission],
  );

  return { v2UiEnabled: v2, canViewPage, canPerform };
}
