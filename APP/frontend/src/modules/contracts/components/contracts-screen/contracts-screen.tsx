"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { useContracts } from "../../hooks/use-contracts";
import { useContract } from "../../hooks/use-contract";
import type { ContractListItemDto } from "../../types/contract.types";
import { resolveContractsListView } from "../../utils/contract-list-view";
import { ContractFilters } from "../contract-filters/contract-filters";
import { ContractsTable } from "../contracts-table/contracts-table";
import { getContractRowAction } from "../../utils/contract-row-action";
import { ContractDetailDrawer } from "../contract-detail/contract-detail-drawer";
import { ContractLinkResultDialog } from "../contract-link-result/contract-link-result-dialog";
import { CarOutDialog } from "../../forms/car-out/car-out-dialog";
import { CarInDialog } from "../../forms/car-in/car-in-dialog";
import { RenewDialog } from "../../forms/renew/renew-dialog";
import { ReconcileDialog } from "../../forms/reconcile/reconcile-dialog";
import { CloseContractDialog } from "../../forms/close/close-contract-dialog";
import { useNotificationRecordTargets } from "@/modules/notifications/simulation/use-notification-record-targets";
import { useRecordFocus } from "@/shared/hooks/use-record-focus";
import tableStyles from "../contracts-table/contracts-table.module.css";
import styles from "./contracts-screen.module.css";

export function ContractsScreen() {
  const t = useTranslations("Contracts");
  const tDateRange = useTranslations("DateRangePicker");
  const locale = useLocale();
  const {
    contracts,
    meta,
    filters,
    activeFilterCount,
    isAllowed,
    isLoading,
    isReady,
    error,
    refreshContracts,
    setStatusFilter,
    applySearch,
    clearSearch,
    setDateRange,
    setSort,
    clearFilters,
    setPage,
  } = useContracts();
  const { generateRentalLink, generateReturnLink } = useContract();
  const registerNotificationTargets = useNotificationRecordTargets();

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [carOutId, setCarOutId] = useState<string | null>(null);
  const [carInId, setCarInId] = useState<string | null>(null);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<{ id: string; number?: string } | null>(null);

  useEffect(() => {
    registerNotificationTargets(
      contracts.map((contract) => ({
        entityType: "contract" as const,
        entityId: contract.id,
        route: "/contracts" as const,
        label: contract.contractNumber,
        reference: contract.vehicleName,
      })),
    );
  }, [contracts, registerNotificationTargets]);

  useRecordFocus({
    ready: isReady,
    version: contracts.map((contract) => contract.id).join("|"),
    highlightClassName: tableStyles.recordFocus,
  });

  const view = resolveContractsListView({
    isAllowed,
    isReady,
    itemCount: contracts.length,
    activeFilterCount,
    hasError: error != null,
  });

  const filterLabels = useMemo(
    () => ({
      statusGroup: t("filters.statusGroup"),
      status: {
        all: t("filters.all"),
        AWAITING: t("status.AWAITING"),
        FORM: t("status.FORM"),
        SIGNED: t("status.SIGNED"),
        PAID: t("status.PAID"),
        ACTIVE: t("status.ACTIVE"),
        RETOUT: t("status.RETOUT"),
        REVIEW: t("status.REVIEW"),
        CLOSED: t("status.CLOSED"),
      },
      sort: {
        newest: t("filters.sort.newest"),
        oldest: t("filters.sort.oldest"),
        amountDesc: t("filters.sort.amountDesc"),
        amountAsc: t("filters.sort.amountAsc"),
        startAt: t("filters.sort.startAt"),
        number: t("filters.sort.number"),
      },
      searchInputLabel: t("search.inputLabel"),
      searchPlaceholder: t("search.placeholder"),
      searchButton: t("search.button"),
      searchClear: t("search.clear"),
      sortLabel: t("filters.sortLabel"),
      dateRange: {
        fieldLabel: t("filters.dateRange"),
        placeholder: tDateRange("placeholder"),
        apply: tDateRange("apply"),
        clear: tDateRange("clear"),
        daysSelected: (count: number) => tDateRange("daysSelected", { count }),
        previousMonth: tDateRange("previousMonth"),
        nextMonth: tDateRange("nextMonth"),
        presets: {
          today: tDateRange("presets.today"),
          last7: tDateRange("presets.last7"),
          last30: tDateRange("presets.last30"),
          thisMonth: tDateRange("presets.thisMonth"),
          lastMonth: tDateRange("presets.lastMonth"),
          custom: tDateRange("presets.custom"),
        },
      },
      clear: t("filters.clear"),
      activeCount: t("filters.activeCount", { count: activeFilterCount }),
    }),
    [t, tDateRange, activeFilterCount],
  );

  const openAction = useCallback(
    (contract: ContractListItemDto) => {
      switch (getContractRowAction(contract)?.kind) {
        case "rentalLink":
          void generateRentalLink(contract.id);
          return;
        case "carOut":
          setCarOutId(contract.id);
          return;
        case "carIn":
          setCarInId(contract.id);
          return;
        case "reconcile":
          setReconcileId(contract.id);
          return;
        default:
          // "manage" (ACTIVE: Renew and the return link) and anything else open the contract.
          setDrawerId(contract.id);
      }
    },
    [generateRentalLink],
  );

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        isReady ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => void refreshContracts()}
            disabled={isLoading}
          >
            {t("refresh")}
          </Button>
        ) : null
      }
    />
  );

  if (view === "denied") {
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

  if (view === "error" && error) {
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
            <Button type="button" onClick={() => void refreshContracts()}>
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

      {view === "loading" ? (
        <div className={styles.skeleton} role="status" aria-label={t("loading")} />
      ) : (
        <>
          <ContractFilters
            filters={filters}
            activeFilterCount={activeFilterCount}
            searchLoading={isLoading}
            resultsLabel={t("filters.results", { count: meta?.total ?? 0 })}
            locale={locale}
            labels={filterLabels}
            onStatusChange={setStatusFilter}
            onSearchSubmit={applySearch}
            onSearchClear={clearSearch}
            onDateRangeApply={setDateRange}
            onDateRangeClear={() => setDateRange("", "")}
            onSortChange={setSort}
            onClear={clearFilters}
          />

          {view === "empty" || view === "filteredEmpty" ? (
            <div data-testid="contracts-empty">
              <EmptyState
                title={view === "empty" ? t("empty.title") : t("empty.filteredTitle")}
                description={
                  view === "empty"
                    ? t("empty.description")
                    : t("empty.filteredDescription")
                }
                action={
                  view === "filteredEmpty" ? (
                    <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                      {t("filters.clear")}
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <ContractsTable
              contracts={contracts}
              onOpen={(contract) => setDrawerId(contract.id)}
              onRowAction={openAction}
            />
          )}

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
                {t("pagination.page", { page: meta.page, totalPages: meta.totalPages })}
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

      <ContractDetailDrawer
        contractId={drawerId}
        onClose={() => setDrawerId(null)}
        onGenerateRentalLink={(id) => void generateRentalLink(id)}
        onCarOut={setCarOutId}
        onCarIn={setCarInId}
        onReturnLink={(id) => void generateReturnLink(id)}
        onRenew={setRenewId}
        onReconcile={setReconcileId}
        onCloseContract={(id) => setCloseTarget({ id })}
      />

      <CarOutDialog contractId={carOutId} onClose={() => setCarOutId(null)} />
      <CarInDialog contractId={carInId} onClose={() => setCarInId(null)} />
      <RenewDialog contractId={renewId} onClose={() => setRenewId(null)} />
      <ReconcileDialog
        contractId={reconcileId}
        onClose={() => setReconcileId(null)}
        onRequestClose={(id) => {
          setReconcileId(null);
          setCloseTarget({ id });
        }}
      />
      <CloseContractDialog
        contractId={closeTarget?.id ?? null}
        contractNumber={closeTarget?.number}
        onClose={() => setCloseTarget(null)}
      />
      <ContractLinkResultDialog />
    </>
  );
}
