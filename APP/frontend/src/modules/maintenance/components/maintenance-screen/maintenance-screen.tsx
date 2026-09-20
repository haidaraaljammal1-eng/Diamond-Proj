"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Icon } from "@/shared/components/ui/icon";
import { PageHeader } from "@/shared/components/ui/page-header";
import { useOperatingCompanies } from "@/modules/operating-companies";
import { AddMaintenanceDialog } from "../../forms/add-maintenance/add-maintenance-dialog";
import { EditMaintenanceDialog } from "../../forms/edit-maintenance/edit-maintenance-dialog";
import {
  CancelMaintenanceDialog,
  CompleteMaintenanceDialog,
} from "../../forms/lifecycle/lifecycle-confirm-dialog";
import {
  useMaintenanceActions,
  useMaintenanceList,
} from "../../hooks/use-maintenance";
import type { MaintenanceOrderDetailDto } from "../../types/maintenance.types";
import { emptyStateKind } from "../../utils/maintenance-filters";
import { resolveMaintenanceErrorMessage } from "../../utils/resolve-maintenance-error";
import { MaintenanceDetailDialog } from "../maintenance-detail/maintenance-detail-dialog";
import { MaintenanceFilters } from "../maintenance-filters/maintenance-filters";
import { MaintenanceGrid } from "../maintenance-grid/maintenance-grid";
import { MaintenanceHistory } from "../maintenance-history/maintenance-history";
import { MaintenanceKpis } from "../maintenance-kpis/maintenance-kpis";
import styles from "./maintenance-screen.module.css";

export function MaintenanceScreen() {
  const t = useTranslations("Maintenance");
  const {
    items,
    meta,
    filters,
    activeFilterCount,
    history,
    historyMeta,
    summary,
    isAllowed,
    canManage,
    isLoading,
    isReady,
    isHistoryLoading,
    isHistoryReady,
    error,
    historyError,
    refresh,
    setStatusFilter,
    applySearch,
    clearSearch,
    setMaintenanceType,
    setCompany,
    setSort,
    clearFilters,
    setPage,
    setHistoryPage,
  } = useMaintenanceList();
  const { actionError, clearActionError } = useMaintenanceActions();
  const tCompany = useTranslations("OperatingCompanies");
  const { companies, isLoading: companiesLoading } = useOperatingCompanies(isAllowed);

  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<MaintenanceOrderDetailDto | null>(
    null,
  );
  const [completeTarget, setCompleteTarget] =
    useState<MaintenanceOrderDetailDto | null>(null);
  const [cancelTarget, setCancelTarget] =
    useState<MaintenanceOrderDetailDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const filterLabels = useMemo(
    () => ({
      statusGroup: t("filters.statusGroup"),
      status: {
        all: t("filters.all"),
        in_service: t("filters.in_service"),
        scheduled: t("filters.scheduled"),
        ready_for_pickup: t("filters.ready_for_pickup"),
        overdue: t("filters.overdue"),
        completed: t("filters.completed"),
      },
      sort: {
        newest: t("filters.sort.newest"),
        scheduledAt: t("filters.sort.scheduledAt"),
        expectedCompletion: t("filters.sort.expectedCompletion"),
      },
      searchInputLabel: t("search.inputLabel"),
      searchPlaceholder: t("search.placeholder"),
      searchButton: t("search.button"),
      searchClear: t("search.clear"),
      typeLabel: t("filters.typeLabel"),
      typeAll: t("filters.typeAll"),
      types: {
        mechanical: t("type.mechanical"),
        electrical: t("type.electrical"),
        tires: t("type.tires"),
        air_conditioning: t("type.air_conditioning"),
        body: t("type.body"),
        periodic: t("type.periodic"),
        other: t("type.other"),
      },
      companyLabel: tCompany("company"),
      companyAll: tCompany("all"),
      companiesLoading: tCompany("loading"),
      sortLabel: t("filters.sortLabel"),
      clear: t("filters.clear"),
      activeCount: t("filters.activeCount", { count: activeFilterCount }),
    }),
    [t, tCompany, activeFilterCount],
  );

  const emptyKind = emptyStateKind({
    status: filters.status,
    hasSearch: Boolean(filters.search.trim()),
    hasType: filters.maintenanceType != null,
    hasCompany: filters.companyId != null,
  });

  const actionMessage = resolveMaintenanceErrorMessage(t, actionError);
  const overdueCount = items.filter((item) => item.overdue).length;

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        isAllowed ? (
          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => void refresh()}
              disabled={isLoading}
            >
              {t("refresh")}
            </Button>
            {canManage ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setAddOpen(true)}
              >
                {t("add")}
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

  return (
    <>
      {header}

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      {actionMessage ? (
        <p className={styles.actionError} role="alert">
          {actionMessage}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => clearActionError()}
          >
            {t("form.close")}
          </Button>
        </p>
      ) : null}

      <MaintenanceKpis summary={summary} />

      {overdueCount > 0 ? (
        <div className={styles.alert} role="status">
          <span className={styles.alertIcon} aria-hidden="true">
            <Icon name="mdi:alert" size={16} />
          </span>
          <div>
            <b>{t("overdue.title", { count: overdueCount })}</b>
            <span>{t("overdue.body")}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={styles.alertBtn}
            onClick={() => setStatusFilter("overdue")}
          >
            {t("overdue.show")}
          </Button>
        </div>
      ) : null}

      <MaintenanceFilters
        filters={filters}
        activeFilterCount={activeFilterCount}
        searchLoading={isLoading}
        resultsLabel={t("filters.results", { count: meta?.total ?? items.length })}
        labels={filterLabels}
        companies={companies}
        companiesLoading={companiesLoading}
        onStatusChange={setStatusFilter}
        onSearchSubmit={applySearch}
        onSearchClear={clearSearch}
        onTypeChange={setMaintenanceType}
        onCompanyChange={setCompany}
        onSortChange={setSort}
        onClear={clearFilters}
      />

      {!isReady && items.length === 0 ? (
        <div
          className={styles.skeletonGrid}
          role="status"
          aria-label={t("loading")}
        >
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className={styles.skeletonCard} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t(`empty.${emptyKind}.title`)}
          description={t(`empty.${emptyKind}.description`)}
          action={
            emptyKind === "search" || emptyKind === "active" ? (
              emptyKind === "search" ? (
                <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                  {t("filters.clear")}
                </Button>
              ) : canManage ? (
                <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
                  {t("add")}
                </Button>
              ) : null
            ) : null
          }
        />
      ) : (
        <>
          <MaintenanceGrid
            items={items}
            canManage={canManage}
            onOpen={(order) => setDetailId(order.id)}
            onEdit={setEditTarget}
            onComplete={setCompleteTarget}
            onCancel={setCancelTarget}
          />
          {meta && meta.totalPages > 1 && filters.status !== "all" ? (
            <div className={styles.pagination}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isLoading || meta.page <= 1}
                onClick={() => setPage(meta.page - 1)}
              >
                {t("pagination.previous")}
              </Button>
              <span className={styles.paginationStatus}>
                {t("pagination.status", {
                  page: meta.page,
                  pages: meta.totalPages,
                })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isLoading || meta.page >= meta.totalPages}
                onClick={() => setPage(meta.page + 1)}
              >
                {t("pagination.next")}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {isHistoryLoading && !isHistoryReady ? (
        <div className={styles.historySkeleton} aria-label={t("history.loading")} />
      ) : historyError ? (
        <section className={styles.panel} role="alert">
          <p className={styles.panelTitle}>{t("history.errorTitle")}</p>
          <p className={styles.panelText}>{t("error.generic")}</p>
        </section>
      ) : history.length === 0 ? (
        <EmptyState
          variant="inline"
          title={t("empty.history.title")}
          description={t("empty.history.description")}
        />
      ) : (
        <>
          <MaintenanceHistory
            items={history}
            total={historyMeta?.total ?? history.length}
            onOpen={(order) => setDetailId(order.id)}
          />
          {historyMeta && historyMeta.totalPages > 1 ? (
            <div className={styles.pagination}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={historyMeta.page <= 1}
                onClick={() => setHistoryPage(historyMeta.page - 1)}
              >
                {t("pagination.previous")}
              </Button>
              <span className={styles.paginationStatus}>
                {t("pagination.status", {
                  page: historyMeta.page,
                  pages: historyMeta.totalPages,
                })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={historyMeta.page >= historyMeta.totalPages}
                onClick={() => setHistoryPage(historyMeta.page + 1)}
              >
                {t("pagination.next")}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <AddMaintenanceDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => showNotice(t("notice.created"))}
      />
      <MaintenanceDetailDialog
        orderId={detailId}
        canManage={canManage}
        onClose={() => setDetailId(null)}
        onEdit={(order) => {
          setDetailId(null);
          setEditTarget(order);
        }}
        onComplete={(order) => {
          setDetailId(null);
          setCompleteTarget(order);
        }}
        onCancel={(order) => {
          setDetailId(null);
          setCancelTarget(order);
        }}
      />
      <EditMaintenanceDialog
        order={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={() => showNotice(t("notice.updated"))}
      />
      <CompleteMaintenanceDialog
        order={completeTarget}
        onClose={() => setCompleteTarget(null)}
        onSuccess={() => showNotice(t("notice.completed"))}
      />
      <CancelMaintenanceDialog
        order={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onSuccess={() => showNotice(t("notice.cancelled"))}
      />
    </>
  );
}
