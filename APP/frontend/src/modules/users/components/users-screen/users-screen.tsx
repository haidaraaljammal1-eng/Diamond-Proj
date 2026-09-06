"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { PageHeader } from "@/shared/components/ui/page-header";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { useUsers } from "../../hooks/use-users";
import { useUserMutations } from "../../hooks/use-user-mutations";
import { nextStatusAfterToggle } from "../../utils/user-status";
import type { UserDto } from "../../types/user.types";
import { UsersGrid } from "../users-grid/users-grid";
import {
  UserFormDialog,
  type UserFormTarget,
} from "../user-form-dialog/user-form-dialog";
import { UserDeleteDialog } from "../user-delete-dialog/user-delete-dialog";
import styles from "./users-screen.module.css";

const ALL_STATUSES = "__all__";

export function UsersScreen() {
  const t = useTranslations("Users");
  const {
    users,
    meta,
    statusFilter,
    isAllowed,
    isLoading,
    isReady,
    error,
    refreshUsers,
    setSearch,
    setStatusFilter,
    setPage,
  } = useUsers();
  const { canCreate, canUpdate, canDelete, setUserStatus, isStatusUpdating, isDeletingUser } =
    useUserMutations();

  const [formTarget, setFormTarget] = useState<UserFormTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserDto | null>(null);
  const [searchDraft, setSearchDraft] = useState("");

  const statusOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL_STATUSES, label: t("allStatuses") },
      { value: "ACTIVE", label: t("statusActive") },
      { value: "PENDING", label: t("statusPending") },
      { value: "SUSPENDED", label: t("statusSuspended") },
    ],
    [t],
  );

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        isReady ? (
          <div className={styles.summary}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void refreshUsers()}
              disabled={isLoading}
            >
              {t("refresh")}
            </Button>
            {canCreate ? (
              <Button
                type="button"
                size="md"
                onClick={() => setFormTarget({ mode: "create" })}
              >
                {t("addUser")}
              </Button>
            ) : null}
          </div>
        ) : canCreate ? (
          <Button
            type="button"
            size="md"
            onClick={() => setFormTarget({ mode: "create" })}
          >
            {t("addUser")}
          </Button>
        ) : null
      }
    />
  );

  const handleToggleStatus = (user: UserDto, nextActive: boolean) => {
    const next = nextActive ? "ACTIVE" : "SUSPENDED";
    if (nextStatusAfterToggle(user.status) !== next) return;
    void setUserStatus(user.id, next);
  };

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
            <Button type="button" onClick={() => void refreshUsers()}>
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
          className={styles.skeletonGrid}
          role="status"
          aria-label={t("loading")}
          data-testid="users-grid-skeleton"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={styles.skeletonCard} />
          ))}
        </div>
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
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") setSearch(searchDraft);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          data-testid="users-search"
        />
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => setSearch(searchDraft)}
        >
          {t("searchAction")}
        </Button>
        <Select
          className={styles.statusFilter}
          options={statusOptions}
          value={statusFilter ?? ALL_STATUSES}
          onChange={(value) =>
            setStatusFilter(value === ALL_STATUSES ? undefined : (value as typeof statusFilter))
          }
          variant="ghost"
          size="sm"
          aria-label={t("statusFilterLabel")}
        />
      </div>

      {users.length === 0 ? (
        <section className={styles.panel} role="status">
          <p className={styles.panelTitle}>{t("empty.title")}</p>
          <p className={styles.panelText}>{t("empty.description")}</p>
          {canCreate ? (
            <div className={styles.panelAction}>
              <Button type="button" onClick={() => setFormTarget({ mode: "create" })}>
                {t("addUser")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <UsersGrid
            users={users}
            canUpdate={canUpdate}
            canDelete={canDelete}
            isStatusUpdating={isStatusUpdating}
            isDeletingUser={isDeletingUser}
            onToggleStatus={canUpdate ? handleToggleStatus : undefined}
            onEdit={canUpdate ? (user) => setFormTarget({ mode: "edit", user }) : undefined}
            onDelete={canDelete ? setDeleteTarget : undefined}
          />
          {meta && meta.totalPages > 1 ? (
            <div className={styles.pagination}>
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={meta.page <= 1 || isLoading}
                onClick={() => setPage(meta.page - 1)}
              >
                {t("pagination.previous")}
              </Button>
              <span>
                {t("pagination.page", {
                  page: meta.page,
                  totalPages: meta.totalPages,
                })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={meta.page >= meta.totalPages || isLoading}
                onClick={() => setPage(meta.page + 1)}
              >
                {t("pagination.next")}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <UserFormDialog
        target={formTarget}
        onClose={() => setFormTarget(null)}
      />
      <UserDeleteDialog
        user={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
