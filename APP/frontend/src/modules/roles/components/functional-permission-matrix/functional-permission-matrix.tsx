"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PermissionCell } from "../permission-cell/permission-cell";
import { RoleHeader } from "../role-header/role-header";
import type { FunctionalPermissionMatrix } from "../../utils/build-functional-matrix";
import { isChildCapabilityRow } from "../../utils/build-functional-matrix";
import type { RoleDto } from "../../types/role.types";
import styles from "../permission-matrix/permission-matrix.module.css";

const PERMISSION_COLUMN_WIDTH = 340;
const ROLE_COLUMN_WIDTH = 172;

export interface FunctionalPermissionMatrixProps {
  matrix: FunctionalPermissionMatrix;
  onEditRole?: (role: RoleDto) => void;
  onToggleGrant?: (
    role: RoleDto,
    capabilityKey: string,
    next: boolean,
  ) => void;
  isCellPending?: (roleId: number, capabilityKey: string) => boolean;
  matrixEditingDisabled?: boolean;
  /** When false, the proposed grant set is not delegable by the current actor. */
  canToggleGrant?: (
    role: RoleDto,
    capabilityKey: string,
    enabled: boolean,
  ) => boolean;
}

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

export function FunctionalPermissionMatrix({
  matrix,
  onEditRole,
  onToggleGrant,
  isCellPending,
  matrixEditingDisabled = false,
  canToggleGrant,
}: FunctionalPermissionMatrixProps) {
  const t = useTranslations("Roles");
  const tFn = useTranslations("FunctionalRbac");
  const locale = useLocale();
  const { scrollRef, placeholders } = usePlaceholderColumns(matrix.roles.length);

  const placeholderCells = Array.from({ length: placeholders }, (_, index) => (
    <td key={`placeholder-${index}`} className={styles.placeholder} aria-hidden="true" />
  ));

  const labelOf = (capabilityKey: string, labels: { ar: string; en: string }) =>
    locale === "ar" ? labels.ar : labels.en;

  return (
    <div className={styles.card} data-testid="functional-rbac-matrix">
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
                  permissionCount={
                    matrix.isFullAccessRole(role)
                      ? matrix.capabilityCount
                      : matrix.grantCountFor(role.id)
                  }
                  systemLabel={
                    matrix.isFullAccessRole(role)
                      ? tFn("matrix.fullAccessBadge")
                      : t("systemRole")
                  }
                  countLabel={
                    matrix.isFullAccessRole(role)
                      ? tFn("matrix.fullAccessCount")
                      : t("rolePermissionCount", {
                          count: matrix.grantCountFor(role.id),
                        })
                  }
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
              <Fragment key={group.pageId}>
                <tr>
                  <th
                    scope="row"
                    className={styles.groupHead}
                    data-testid={`functional-rbac-group-${group.pageId}`}
                  >
                    {tFn(`pages.${group.pageId}`)}
                    <span className={styles.groupCount}>
                      {t("groupPermissionCount", {
                        count: group.capabilities.length,
                      })}
                    </span>
                  </th>
                  <td
                    colSpan={matrix.roles.length + placeholders}
                    className={styles.groupHeadSpacer}
                    aria-hidden="true"
                  />
                </tr>
                {group.capabilities.map((capability) => (
                  <tr
                    key={capability.key}
                    className={styles.row}
                    data-testid="functional-rbac-capability-row"
                    data-capability-key={capability.key}
                  >
                    <th
                      scope="row"
                      className={`${styles.rowHead} ${
                        isChildCapabilityRow(capability.key) ? styles.childRow : ""
                      }`}
                    >
                      <span className={styles.permissionLabel}>
                        {labelOf(capability.key, capability.labels)}
                      </span>
                    </th>
                    {matrix.roles.map((role) => {
                      const fullAccess = matrix.isFullAccessRole(role);
                      const allowed =
                        fullAccess || matrix.hasGrant(role.id, capability.key);
                      const nextEnabled = !allowed;
                      const delegable =
                        canToggleGrant?.(role, capability.key, nextEnabled) ??
                        true;
                      const editable =
                        Boolean(onToggleGrant) &&
                        !fullAccess &&
                        !role.isSystem &&
                        !matrixEditingDisabled &&
                        delegable;
                      return (
                        <PermissionCell
                          key={role.id}
                          allowed={allowed}
                          label={t("cellLabel", {
                            permission: labelOf(capability.key, capability.labels),
                            role: role.name,
                          })}
                          onToggle={
                            editable
                              ? (next) =>
                                  onToggleGrant?.(role, capability.key, next)
                              : undefined
                          }
                          disabled={!editable}
                          pending={isCellPending?.(role.id, capability.key)}
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
