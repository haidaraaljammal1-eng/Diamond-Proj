"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { useContracts } from "../../hooks/use-contracts";
import { useContract } from "../../hooks/use-contract";
import type { ContractListItemDto } from "../../types/contract.types";
import { resolveContractsListView } from "../../utils/contract-list-view";
import { ContractFilters } from "../contract-filters/contract-filters";
import { ContractsTable } from "../contracts-table/contracts-table";
import { ContractDetailDrawer } from "../contract-detail/contract-detail-drawer";
import { ContractLinkResultDialog } from "../contract-link-result/contract-link-result-dialog";
import { PaymentConfirmDialog } from "../../forms/payment/payment-confirm-dialog";
import { CarOutDialog } from "../../forms/car-out/car-out-dialog";
import { RenewDialog } from "../../forms/renew/renew-dialog";
import { ReconcileDialog } from "../../forms/reconcile/reconcile-dialog";
import { CloseContractDialog } from "../../forms/close/close-contract-dialog";
import styles from "./contracts-screen.module.css";

export function ContractsScreen() {
  const t = useTranslations("Contracts");
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

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<{
    id: string;
    agreedAmount: number;
  } | null>(null);
  const [carOutId, setCarOutId] = useState<string | null>(null);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<{ id: string; number?: string } | null>(null);

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
      fromLabel: t("filters.from"),
      toLabel: t("filters.to"),
      clear: t("filters.clear"),
      activeCount: t("filters.activeCount", { count: activeFilterCount }),
    }),
    [t, activeFilterCount],
  );

  const openAction = useCallback(
    (contract: ContractListItemDto) => {
      if (contract.status === "AWAITING" || contract.status === "FORM" || contract.status === "SIGNED") {
        if (contract.status === "SIGNED") {
          setPaymentTarget({ id: contract.id, agreedAmount: contract.agreedAmount });
          return;
        }
        void generateRentalLink(contract.id);
        return;
      }
      if (contract.status === "PAID") {
        setCarOutId(contract.id);
        return;
      }
      if (contract.status === "ACTIVE") {
        void generateReturnLink(contract.id);
        return;
      }
      if (contract.status === "REVIEW") {
        setReconcileId(contract.id);
        return;
      }
      setDrawerId(contract.id);
    },
    [generateRentalLink, generateReturnLink],
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
            labels={filterLabels}
            onStatusChange={setStatusFilter}
            onSearchSubmit={applySearch}
            onSearchClear={clearSearch}
            onDateRangeChange={setDateRange}
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
        onConfirmPayment={(id) => {
          const row = contracts.find((item) => item.id === id);
          setPaymentTarget({ id, agreedAmount: row?.agreedAmount ?? 0 });
        }}
        onCarOut={setCarOutId}
        onReturnLink={(id) => void generateReturnLink(id)}
        onRenew={setRenewId}
        onReconcile={setReconcileId}
        onCloseContract={(id) => setCloseTarget({ id })}
      />

      <PaymentConfirmDialog
        contractId={paymentTarget?.id ?? null}
        amount={paymentTarget?.agreedAmount ?? 0}
        onClose={() => setPaymentTarget(null)}
      />
      <CarOutDialog contractId={carOutId} onClose={() => setCarOutId(null)} />
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
