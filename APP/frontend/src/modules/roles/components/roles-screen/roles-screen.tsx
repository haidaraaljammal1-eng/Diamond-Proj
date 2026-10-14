"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { PageHeader } from "@/shared/components/ui/page-header";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { RbacV2ModeBanner } from "@/modules/functional-rbac";
import { useLocale } from "next-intl";
import { useRolesPermissions } from "../../hooks/use-roles-permissions";
import { usePermissionLabels } from "../../hooks/use-permission-labels";
import { filterPermissionMatrix } from "../../utils/permission-matrix";
import { PermissionMatrix } from "../permission-matrix/permission-matrix";
import { FunctionalPermissionMatrix } from "../functional-permission-matrix/functional-permission-matrix";
import { RoleFormDialog } from "../role-form-dialog";
import type { RoleFormTarget } from "../role-form-dialog";
import { useRoleMutations } from "../../hooks/use-role-mutations";
import styles from "./roles-screen.module.css";

const ALL_GROUPS = "__all__";
/** Below this a filter chooser costs more than it saves. */
const GROUP_FILTER_MIN_GROUPS = 4;

export function RolesScreen() {
  const t = useTranslations("Roles");
  const tFn = useTranslations("FunctionalRbac");
  const locale = useLocale();
  const labels = usePermissionLabels();
  const {
    matrix,
    functionalMatrix,
    useFunctionalMatrix,
    isAllowed,
    isLoading,
    isReady,
    error,
    refresh,
  } = useRolesPermissions();
  const {
    canManage,
    canEditRoleMetadata,
    canEditMatrix,
    matrixEditingDisabled,
    togglePermission,
    toggleFunctionalGrant,
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

  const groupOptions = useMemo<SelectOption[]>(() => {
    if (useFunctionalMatrix) {
      return [
        { value: ALL_GROUPS, label: t("allGroups") },
        ...functionalMatrix.groups.map((matrixGroup) => ({
          value: matrixGroup.pageId,
          label: tFn(`pages.${matrixGroup.pageId}`),
        })),
      ];
    }
    return [
      { value: ALL_GROUPS, label: t("allGroups") },
      ...matrix.groups.map((matrixGroup) => ({
        value: matrixGroup.key,
        label: labels.groupLabelOf(matrixGroup.key),
      })),
    ];
  }, [useFunctionalMatrix, functionalMatrix.groups, matrix.groups, labels, t, tFn]);

  const visibleFunctionalMatrix = useMemo(() => {
    if (!useFunctionalMatrix) return functionalMatrix;
    const query = search.trim().toLowerCase();
    const groups = functionalMatrix.groups
      .filter((g) => group === ALL_GROUPS || g.pageId === group)
      .map((g) => ({
        ...g,
        capabilities: g.capabilities.filter((cap) => {
          if (!query) return true;
          const label = locale === "ar" ? cap.labels.ar : cap.labels.en;
          return (
            label.toLowerCase().includes(query) ||
            cap.key.toLowerCase().includes(query)
          );
        }),
      }))
      .filter((g) => g.capabilities.length > 0);
    return { ...functionalMatrix, groups };
  }, [useFunctionalMatrix, functionalMatrix, search, group, locale]);

  const permissionCount = useFunctionalMatrix
    ? functionalMatrix.capabilityCount
    : matrix.permissionCount;

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={
        useFunctionalMatrix ? tFn("rolesSubtitle") : t("subtitle")
      }
      actions={
        isReady ? (
          <div className={styles.summary}>
            <span className={styles.stat}>
              <span className={styles.statValue}>{matrix.roles.length}</span>
              {t("summaryRoles")}
            </span>
            <span className={styles.stat}>
              <span className={styles.statValue}>{permissionCount}</span>
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
        <section className={styles.panel} role="status" data-testid="roles-denied">
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

  if (!useFunctionalMatrix && matrix.permissionCount === 0) {
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
        {(useFunctionalMatrix
          ? functionalMatrix.groups.length
          : matrix.groups.length) >= GROUP_FILTER_MIN_GROUPS ? (
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

      <RbacV2ModeBanner />

      <div className={styles.matrixSection}>
        {useFunctionalMatrix ? (
          visibleFunctionalMatrix.groups.length === 0 ? (
            <section className={styles.panel} role="status">
              <p className={styles.panelTitle}>{t("noResults.title")}</p>
              <p className={styles.panelText}>{t("noResults.description")}</p>
            </section>
          ) : (
            <FunctionalPermissionMatrix
              matrix={visibleFunctionalMatrix}
              matrixEditingDisabled={matrixEditingDisabled}
              onEditRole={
                canEditRoleMetadata
                  ? (role) => setFormTarget({ mode: "edit", role })
                  : undefined
              }
              onToggleGrant={
                canEditMatrix
                  ? (role, capabilityKey, next) => {
                      void toggleFunctionalGrant(role.id, capabilityKey, next);
                    }
                  : undefined
              }
              isCellPending={isCellPending}
            />
          )
        ) : visibleMatrix.groups.length === 0 ? (
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
      </div>

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
