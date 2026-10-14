import { env } from "src/config/env";
import type { AuthUser } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";
import {
  canPerformFunctionalCapability,
  canViewFunctionalPage,
  normalizeFunctionalGrants,
} from "./policy-engine";
import type { FunctionalPageId } from "./types";
import { isFunctionalCapabilityKey } from "./keys";

/** Default **off** — existing legacy route authorization remains authoritative. */
export function isFunctionalRbacV2Enabled(): boolean {
  const fromProcess = process.env.FUNCTIONAL_RBAC_V2_ENABLED;
  if (fromProcess === "false" || fromProcess === "0") return false;
  if (fromProcess === "true" || fromProcess === "1") return true;
  return env.FUNCTIONAL_RBAC_V2_ENABLED;
}

export function extractRawFunctionalGrants(permissions: readonly string[]): string[] {
  return permissions.filter((p) => isFunctionalCapabilityKey(p));
}

export function getNormalizedFunctionalGrants(auth: AuthUser): string[] {
  if (auth.isSystemAdmin) {
    return [];
  }
  const raw = extractRawFunctionalGrants(auth.permissions);
  const result = normalizeFunctionalGrants(raw);
  return result.ok ? result.normalized : [];
}

export interface FunctionalRouteRequirement {
  keys: readonly string[];
  /** When true (default), every key must be held. */
  requireAll: boolean;
}

export function assertFunctionalRouteAuthorization(
  auth: AuthUser,
  requirement: FunctionalRouteRequirement,
): void {
  if (!isFunctionalRbacV2Enabled()) return;
  if (auth.isSystemAdmin) return;

  const ctx = {
    functionalGrants: getNormalizedFunctionalGrants(auth),
    isSystemAdmin: false,
  };
  const { keys, requireAll } = requirement;
  if (keys.length === 0) {
    throw AppError.forbidden();
  }
  if (requireAll) {
    for (const key of keys) {
      if (!canPerformFunctionalCapability(ctx, key)) {
        throw AppError.forbidden();
      }
    }
    return;
  }
  const any = keys.some((key) => canPerformFunctionalCapability(ctx, key));
  if (!any) throw AppError.forbidden();
}

export function assertFunctionalPageAccess(
  auth: AuthUser,
  pageId: FunctionalPageId,
): void {
  if (!isFunctionalRbacV2Enabled()) return;
  if (auth.isSystemAdmin) return;
  const ctx = {
    functionalGrants: getNormalizedFunctionalGrants(auth),
    isSystemAdmin: false,
  };
  if (!canViewFunctionalPage(ctx, pageId)) {
    throw AppError.forbidden();
  }
}

export function hasFunctionalCapability(
  auth: AuthUser,
  capabilityKey: string,
): boolean {
  if (!isFunctionalRbacV2Enabled()) return false;
  if (auth.isSystemAdmin) return true;
  return canPerformFunctionalCapability(
    {
      functionalGrants: getNormalizedFunctionalGrants(auth),
      isSystemAdmin: false,
    },
    capabilityKey,
  );
}
