"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { PageHeader } from "@/shared/components/ui/page-header";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { useRolesPermissions } from "../../hooks/use-roles-permissions";
import { usePermissionLabels } from "../../hooks/use-permission-labels";
import { filterPermissionMatrix } from "../../utils/permission-matrix";
import { PermissionMatrix } from "../permission-matrix/permission-matrix";
import { RoleFormDialog } from "../role-form-dialog";
import type { RoleFormTarget } from "../role-form-dialog";
import { useRoleMutations } from "../../hooks/use-role-mutations";
import styles from "./roles-screen.module.css";

const ALL_GROUPS = "__all__";
/** Below this a filter chooser costs more than it saves. */
const GROUP_FILTER_MIN_GROUPS = 4;

export function RolesScreen() {
  const t = useTranslations("Roles");
  const labels = usePermissionLabels();
  const { matrix, isAllowed, isLoading, isReady, error, refresh } =
    useRolesPermissions();
  const {
    canManage,
    togglePermission,
    isCellPending,
    error: writeError,
    clearError: clearWriteError,
  } = useRoleMutations();

  // Which role dialog is open — UI-local, never store state.
  const [formTarget, setFormTarget] = useState<RoleFormTarget | null>(null);

  // Search and group filter are UI-local: the whole catalog is already loaded,
  // so filtering is derived locally and never hits the Backend per keystroke.
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>(ALL_GROUPS);

  const visibleMatrix = useMemo(
    () =>
      filterPermissionMatrix(matrix, {
        search,
        group: group === ALL_GROUPS ? null : group,
        labelOf: labels.labelOf,
      }),
    [matrix, search, group, labels],
  );

  const groupOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL_GROUPS, label: t("allGroups") },
      ...matrix.groups.map((matrixGroup) => ({
        value: matrixGroup.key,
        label: labels.groupLabelOf(matrixGroup.key),
      })),
    ],
    [matrix.groups, labels, t],
  );

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        isReady ? (
          <div className={styles.summary}>
            <span className={styles.stat}>
              <span className={styles.statValue}>{matrix.roles.length}</span>
              {t("summaryRoles")}
            </span>
            <span className={styles.stat}>
              <span className={styles.statValue}>{matrix.permissionCount}</span>
              {t("summaryPermissions")}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void refresh()}
              disabled={isLoading}
            >
              {t("refresh")}
            </Button>
            {canManage ? (
              <Button
                type="button"
                size="md"
                onClick={() => setFormTarget({ mode: "create" })}
              >
                {t("form.createAction")}
              </Button>
            ) : null}
          </div>
        ) : null
      }
    />
  );

  if (!isAllowed) {
    return (
      <>
        {header}
        <section className={styles.panel} role="status">
          <p className={styles.panelTitle}>{t("denied.title")}</p>
          <p className={styles.panelText}>{t("denied.description")}</p>
        </section>
      </>
    );
  }

  if (error) {
    const codeKey = `error.${error.code}`;
    return (
      <>
        {header}
        <section className={styles.panel} role="alert">
          <p className={styles.panelTitle}>{t("error.title")}</p>
          <p className={styles.panelText}>
            {t.has(codeKey) ? t(codeKey) : t("error.generic")}
          </p>
          <div className={styles.panelAction}>
            <Button type="button" onClick={() => void refresh()}>
              {t("error.retry")}
            </Button>
          </div>
        </section>
      </>
    );
  }

  if (!isReady) {
    return (
      <>
        {header}
        <div
          className={styles.skeleton}
          role="status"
          aria-label={t("loading")}
          data-testid="roles-matrix-skeleton"
        >
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} className={styles.skeletonRow} />
          ))}
        </div>
      </>
    );
  }

  if (matrix.roles.length === 0) {
    return (
      <>
        {header}
        <section className={styles.panel}>
          <p className={styles.panelTitle}>{t("emptyRoles.title")}</p>
          <p className={styles.panelText}>{t("emptyRoles.description")}</p>
        </section>
      </>
    );
  }

  if (matrix.permissionCount === 0) {
    return (
      <>
        {header}
        <section className={styles.panel}>
          <p className={styles.panelTitle}>{t("emptyPermissions.title")}</p>
          <p className={styles.panelText}>{t("emptyPermissions.description")}</p>
        </section>
      </>
    );
  }

  return (
    <>
      {header}
      <div className={styles.toolbar}>
        <Input
          className={styles.search}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          data-testid="roles-search"
        />
        {matrix.groups.length >= GROUP_FILTER_MIN_GROUPS ? (
          <Select
            className={styles.groupFilter}
            options={groupOptions}
            value={group}
            onChange={setGroup}
            variant="ghost"
            size="sm"
            searchable
            aria-label={t("groupFilterLabel")}
          />
        ) : null}
      </div>

      {visibleMatrix.groups.length === 0 ? (
        <section className={styles.panel} role="status">
          <p className={styles.panelTitle}>{t("noResults.title")}</p>
          <p className={styles.panelText}>{t("noResults.description")}</p>
        </section>
      ) : (
        <PermissionMatrix
          matrix={visibleMatrix}
          labels={labels}
          onEditRole={
            canManage ? (role) => setFormTarget({ mode: "edit", role }) : undefined
          }
          onTogglePermission={
            canManage
              ? (role, permissionKey, next) => {
                  void togglePermission(role.id, permissionKey, next);
                }
              : undefined
          }
          isCellPending={isCellPending}
        />
      )}

      {writeError && formTarget === null ? (
        <p className={styles.writeError} role="alert">
          {t.has(`error.${writeError.code}`)
            ? t(`error.${writeError.code}`)
            : t("error.generic")}
          <button
            type="button"
            className={styles.writeErrorDismiss}
            onClick={clearWriteError}
          >
            {t("form.close")}
          </button>
        </p>
      ) : null}

      <RoleFormDialog target={formTarget} onClose={() => setFormTarget(null)} />
    </>
  );
}
