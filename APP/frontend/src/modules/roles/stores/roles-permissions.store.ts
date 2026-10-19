"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { requestSessionPermissionSync } from "@/infrastructure/auth/request-session-permission-sync";
import { refreshAfterPending } from "@/infrastructure/state/refresh-after-pending";
import { useRoleLookupStore } from "@/modules/users/stores/role-lookup.store";
import {
  applyFunctionalGrantToggle,
  extractFunctionalGrantsFromPermissions,
  isFunctionalRbacV2UiEnabled,
} from "@/modules/functional-rbac";
import {
  createRole,
  listAllRoles,
  setRoleFunctionalGrants,
  setRolePermissions,
  updateRole,
} from "../api/roles.api";
import type {
  CreateRolePayload,
  UpdateRolePayload,
} from "../api/roles.api";
import { listPermissions } from "../api/permissions.api";
import type { PermissionDto } from "../types/permission.types";
import type { RoleDto } from "../types/role.types";
import {
  shouldRefetchInBackground,
  type RolesLoadStatus,
} from "./roles-permissions.refetch-policy";

export type { RolesLoadStatus };

interface RolesPermissionsState {
  /** Raw Backend entities only — no derived map, no translated text, no JSX. */
  roles: RoleDto[];
  permissions: PermissionDto[];
  status: RolesLoadStatus;
  error: ApiRequestError | null;
  /** Loads once; a second call while loading or ready is a no-op. */
  load: () => Promise<void>;
  /** Re-fetches both collections, keeping the current data until they land. */
  refresh: () => Promise<void>;
  /** In-flight state of a create/update submission. */
  isSubmitting: boolean;
  submitError: ApiRequestError | null;
  clearSubmitError: () => void;
  /** Resolves to `true` when the Backend accepted the write. */
  createRole: (payload: CreateRolePayload) => Promise<boolean>;
  updateRole: (id: number, payload: UpdateRolePayload) => Promise<boolean>;
  /**
   * Grants or revokes one permission for one role and saves immediately.
   * Applied optimistically and rolled back when the Backend refuses.
   * Keys are `<roleId>:<permissionKey>` — serializable, no Set/Map in state.
   */
  pendingCells: Record<string, true>;
  toggleRolePermission: (
    roleId: number,
    permissionKey: string,
    next: boolean,
  ) => Promise<boolean>;
  toggleFunctionalGrant: (
    roleId: number,
    capabilityKey: string,
    next: boolean,
  ) => Promise<boolean>;
}

export function cellKey(roleId: number, permissionKey: string): string {
  return `${roleId}:${permissionKey}`;
}

/**
 * Guards against React Strict Mode double effects and concurrent callers:
 * every caller awaits the same in-flight request instead of firing a new one.
 */
let inFlight: Promise<void> | null = null;

export const useRolesPermissionsStore = create<RolesPermissionsState>(
  (set, get) => {
    async function fetchAll(background: boolean): Promise<void> {
      if (!background) {
        set({ status: "loading", error: null });
      }
      try {
        // No dependency between the two calls — load them in parallel.
        if (isFunctionalRbacV2UiEnabled()) {
          const roles = await listAllRoles();
          set({ roles, permissions: [], status: "ready", error: null });
        } else {
          const [roles, permissions] = await Promise.all([
            listAllRoles(),
            listPermissions(),
          ]);
          set({ roles, permissions, status: "ready", error: null });
        }
      } catch (error) {
        // A partial result is never published: a failed catalog would render a
        // matrix that looks complete but is not.
        const apiError = normalizeApiError(error);
        if (background) {
          set({ submitError: apiError });
        } else {
          set({ status: "error", error: apiError });
        }
      }
    }

    /**
     * Runs one write, then reloads so the matrix reflects the Backend rather
     * than a locally patched copy. The Backend stays the authority.
     */
    async function submit(action: () => Promise<unknown>): Promise<boolean> {
      set({ isSubmitting: true, submitError: null });
      try {
        await action();
        await Promise.allSettled([
          refreshRoles(),
          useRoleLookupStore.getState().refresh(),
        ]);
        set({ isSubmitting: false });
        return true;
      } catch (error) {
        set({ isSubmitting: false, submitError: normalizeApiError(error) });
        return false;
      }
    }

    function run(background = false): Promise<void> {
      if (inFlight) return inFlight;
      const useBackground =
        background || shouldRefetchInBackground(get().status);
      inFlight = fetchAll(useBackground).finally(() => {
        inFlight = null;
      });
      return inFlight;
    }

    function refreshRoles(): Promise<void> {
      return refreshAfterPending(() => inFlight, () => run(true));
    }

    return {
      roles: [],
      permissions: [],
      status: "idle",
      error: null,
      load() {
        const status = get().status;
        if (status === "ready") {
          return inFlight ?? Promise.resolve();
        }
        if (status === "loading" && !inFlight) {
          set({ status: "idle", error: null });
          return run();
        }
        if (status === "loading") {
          return inFlight ?? Promise.resolve();
        }
        return run();
      },
      refresh() {
        return refreshRoles();
      },
      isSubmitting: false,
      submitError: null,
      clearSubmitError() {
        set({ submitError: null });
      },
      async createRole(payload) {
        return submit(() => createRole(payload));
      },
      async updateRole(id, payload) {
        return submit(() => updateRole(id, payload));
      },
      pendingCells: {},
      async toggleFunctionalGrant(roleId, capabilityKey, next) {
        const previousRoles = get().roles;
        const role = previousRoles.find((item) => item.id === roleId);
        if (!role) return false;

        const currentFunctional = extractFunctionalGrantsFromPermissions(
          role.permissions,
        );
        const functionalGrants = applyFunctionalGrantToggle(
          currentFunctional,
          capabilityKey,
          next,
        );
        const key = cellKey(roleId, capabilityKey);

        set((state) => ({
          pendingCells: { ...state.pendingCells, [key]: true },
          submitError: null,
        }));

        try {
          const updated = await setRoleFunctionalGrants(roleId, {
            functionalGrants,
            ifMatchUpdatedAt: role.updatedAt,
          });
          set((state) => ({
            roles: state.roles.map((item) =>
              item.id === roleId ? updated : item,
            ),
          }));
          requestSessionPermissionSync();
          return true;
        } catch (error) {
          const apiError = normalizeApiError(error);
          if (apiError.code === "RESOURCE_MODIFIED") {
            await refreshRoles();
            set({ submitError: apiError });
            return false;
          }
          set({ roles: previousRoles, submitError: apiError });
          return false;
        } finally {
          set((state) => {
            const rest = { ...state.pendingCells };
            delete rest[key];
            return { pendingCells: rest };
          });
        }
      },
      async toggleRolePermission(roleId, permissionKey, next) {
        const previousRoles = get().roles;
        const role = previousRoles.find((item) => item.id === roleId);
        if (!role) return false;

        // Always merge against the role's full Backend grant list so hidden
        // matrix rows are never dropped by PUT /roles/:id/permissions.
        const permissions = next
          ? role.permissions.includes(permissionKey)
            ? role.permissions
            : [...role.permissions, permissionKey]
          : role.permissions.filter((key) => key !== permissionKey);
        const key = cellKey(roleId, permissionKey);

        // Optimistic: the cell reflects the intent immediately.
        set((state) => ({
          roles: state.roles.map((item) =>
            item.id === roleId ? { ...item, permissions } : item,
          ),
          pendingCells: { ...state.pendingCells, [key]: true },
          submitError: null,
        }));

        try {
          const updated = await setRolePermissions(roleId, permissions);
          set((state) => ({
            roles: state.roles.map((item) =>
              item.id === roleId ? updated : item,
            ),
          }));
          return true;
        } catch (error) {
          // The Backend refused (a system role, a stale key, …): put the
          // previous grants back rather than showing a state it never accepted.
          set({ roles: previousRoles, submitError: normalizeApiError(error) });
          return false;
        } finally {
          set((state) => {
            const rest = { ...state.pendingCells };
            delete rest[key];
            return { pendingCells: rest };
          });
        }
      },
    };
  },
);
