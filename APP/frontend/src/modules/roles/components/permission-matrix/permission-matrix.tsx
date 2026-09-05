"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PermissionCell } from "../permission-cell/permission-cell";
import { RoleHeader } from "../role-header/role-header";
import type { PermissionLabels } from "../../hooks/use-permission-labels";
import type { PermissionMatrix as PermissionMatrixModel } from "../../utils/permission-matrix";
import type { RoleDto } from "../../types/role.types";
import styles from "./permission-matrix.module.css";

export interface PermissionMatrixProps {
  matrix: PermissionMatrixModel;
  labels: PermissionLabels;
  /** Provided only when the session may manage roles. */
  onEditRole?: (role: RoleDto) => void;
  /**
   * Grants or revokes one permission, saved immediately. Absent when the
   * session may not manage roles; the cells are then read-only.
   */
  onTogglePermission?: (
    role: RoleDto,
    permissionKey: string,
    next: boolean,
  ) => void;
  /** That cell's write is still in flight. */
  isCellPending?: (roleId: number, permissionKey: string) => boolean;
}

/** Mirrors the column widths in `permission-matrix.module.css`. */
const PERMISSION_COLUMN_WIDTH = 340;
const ROLE_COLUMN_WIDTH = 172;

/**
 * How many empty columns are needed so the role columns keep their own width
 * instead of stretching when the Backend returns only a few roles.
 */
function usePlaceholderColumns(roleCount: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [placeholders, setPlaceholders] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const measure = () => {
      const free = element.clientWidth - PERMISSION_COLUMN_WIDTH;
      const slots = Math.floor(free / ROLE_COLUMN_WIDTH);
      setPlaceholders(Math.max(0, slots - roleCount));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [roleCount]);

  return { scrollRef, placeholders };
}

/**
 * The matrix itself: a semantic table (`<th scope="col">` per role,
 * `<th scope="row">` per permission) with a sticky role header and a sticky
 * permission column. It owns layout, stickiness and scrolling only — it knows
 * nothing about APIs, stores or permissions of the signed-in user.
 */
export function PermissionMatrix({
  matrix,
  labels,
  onEditRole,
  onTogglePermission,
  isCellPending,
}: PermissionMatrixProps) {
  const t = useTranslations("Roles");
  const { scrollRef, placeholders } = usePlaceholderColumns(matrix.roles.length);

  // Empty filler cells: presentational only, hidden from assistive tech.
  const placeholderCells = Array.from({ length: placeholders }, (_, index) => (
    <td key={`placeholder-${index}`} className={styles.placeholder} aria-hidden="true" />
  ));

  return (
    <div className={styles.card}>
      <div className={styles.scroll} ref={scrollRef}>
        <table className={styles.table}>
          <caption className={styles.caption}>{t("matrixCaption")}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}>
                {t("permissionColumn")}
              </th>
              {matrix.roles.map((role) => (
                <RoleHeader
                  key={role.id}
                  role={role}
                  permissionCount={matrix.permissionCountFor(role.id)}
                  systemLabel={t("systemRole")}
                  countLabel={t("rolePermissionCount", {
                    count: matrix.permissionCountFor(role.id),
                  })}
                  onEdit={onEditRole ? () => onEditRole(role) : undefined}
                  editLabel={t("form.editRole", { role: role.name })}
                />
              ))}
              {Array.from({ length: placeholders }, (_, index) => (
                <td
                  key={`placeholder-head-${index}`}
                  className={`${styles.placeholder} ${styles.placeholderHead}`}
                  aria-hidden="true"
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.groups.map((group) => (
              <Fragment key={group.key}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={matrix.roles.length + placeholders + 1}
                    className={styles.groupHead}
                  >
                    {labels.groupLabelOf(group.key)}
                    <span className={styles.groupCount}>
                      {t("groupPermissionCount", {
                        count: group.permissions.length,
                      })}
                    </span>
                  </th>
                </tr>
                {group.permissions.map((permission) => (
                  <tr key={permission.id} className={styles.row}>
                    <th scope="row" className={styles.rowHead}>
                      <span className={styles.permissionLabel}>
                        {labels.labelOf(permission)}
                      </span>
                      <span className={styles.permissionKey}>
                        {permission.key}
                      </span>
                    </th>
                    {matrix.roles.map((role) => {
                      const allowed = matrix.hasPermission(role.id, permission.key);
                      // A system role is Backend-locked: it is shown, never edited.
                      const editable = Boolean(onTogglePermission) && !role.isSystem;
                      return (
                        <PermissionCell
                          key={role.id}
                          allowed={allowed}
                          label={t("cellLabel", {
                            permission: labels.labelOf(permission),
                            role: role.name,
                          })}
                          onToggle={
                            editable
                              ? (next) =>
                                  onTogglePermission?.(role, permission.key, next)
                              : undefined
                          }
                          disabled={role.isSystem}
                          pending={isCellPending?.(role.id, permission.key)}
                        />
                      );
                    })}
                    {placeholderCells}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
