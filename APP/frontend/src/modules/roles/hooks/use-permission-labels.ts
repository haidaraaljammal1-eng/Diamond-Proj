"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { PermissionDto } from "../types/permission.types";
import {
  resolvePermissionAction,
  resolvePermissionGroup,
} from "../utils/permission-matrix";

export interface PermissionLabels {
  /** Display label of one permission row. */
  labelOf: (permission: PermissionDto) => string;
  /** Display label of one permission group (Backend category). */
  groupLabelOf: (groupKey: string) => string;
}

/** Message keys cannot contain dots — `vehicles.read` → `vehicles_read`. */
function toMessageKey(value: string): string {
  return value.replace(/\./g, "_");
}

/**
 * Permission catalog labels.
 *
 * The catalog is Backend-owned and grows without the frontend, so labels are
 * composed instead of hand-written one by one:
 *   1. a per-permission override (`Roles.permissions.<key>`) when it exists,
 *   2. otherwise the translated action sentence (`Roles.actions.<action>`)
 *      filled with the group nouns (`Roles.groups.*` / `Roles.groupsSingular.*`),
 *      e.g. "View departments" / "Add department",
 *   3. otherwise the stable technical key itself (`vehicles.read`).
 *
 * Step 3 is a deliberate, controlled fallback for a permission the Backend
 * added but the frontend has not labelled yet — never a raw i18n key leaking
 * into the UI.
 */
export function usePermissionLabels(): PermissionLabels {
  const t = useTranslations("Roles");

  const labelOf = useCallback(
    (permission: PermissionDto) => {
      const override = `permissions.${toMessageKey(permission.key)}`;
      if (t.has(override)) return t(override);

      const action = resolvePermissionAction(permission.key);
      const actionKey = `actions.${toMessageKey(action)}`;
      const group = toMessageKey(resolvePermissionGroup(permission));
      const resourceKey = `groups.${group}`;
      const singularKey = `groupsSingular.${group}`;

      if (
        action.length > 0 &&
        t.has(actionKey) &&
        t.has(resourceKey) &&
        t.has(singularKey)
      ) {
        return t(actionKey, {
          resource: t(resourceKey),
          resourceSingular: t(singularKey),
        });
      }

      return permission.key;
    },
    [t],
  );

  const groupLabelOf = useCallback(
    (groupKey: string) => {
      const messageKey = `groups.${toMessageKey(groupKey)}`;
      return t.has(messageKey) ? t(messageKey) : groupKey;
    },
    [t],
  );

  return useMemo(() => ({ labelOf, groupLabelOf }), [labelOf, groupLabelOf]);
}
