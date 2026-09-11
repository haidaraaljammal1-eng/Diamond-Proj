"use client";

import { useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import { usePermissions } from "@/modules/auth";
import { useDemoSimulationStore } from "@/modules/demo-simulation/simulation.store";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  FINANCE_MANAGE_EXPENSES_PERMISSION,
  FINANCE_PAGE_PERMISSIONS,
} from "../finance.permissions";
import type { PageMeta } from "../api/finance.api.types";
import {
  loadFinancePageData,
  useFinanceStore,
} from "../stores/finance.store";
import type {
  CorrectManualExpensePayload,
  CreateManualExpensePayload,
  FinanceAnalyticsDto,
  FinancePeriodPreset,
  FinanceSummaryDto,
  LedgerDirection,
  LedgerDisplaySource,
  LedgerEntryDto,
  ManualExpenseDetailDto,
  OpenReceivableDto,
  OpenReceivableSourceType,
  ReceivableSortKey,
  VoidManualExpensePayload,
} from "../types/finance.types";
import { toLedgerApiFilters } from "../utils/finance-labels";
import { resolveFinancePeriodRange } from "../utils/finance-period";
import {
  deriveFinanceAnalytics,
  deriveFinanceSummary,
  filterSimulatedLedger,
  filterSimulatedReceivables,
  isSimulatedFinanceId,
} from "../utils/finance-simulation";

export function useFinanceOverview() {
  const { hasPermission } = usePermissions();
  const isAllowed = FINANCE_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );
  const canManageExpenses = hasPermission(FINANCE_MANAGE_EXPENSES_PERMISSION);

  const summary = useFinanceStore((s) => s.summary);
  const analytics = useFinanceStore((s) => s.analytics);
  const overviewQuery = useFinanceStore((s) => s.overviewQuery);
  const summaryStatus = useFinanceStore((s) => s.summaryStatus);
  const analyticsStatus = useFinanceStore((s) => s.analyticsStatus);
  const summaryError = useFinanceStore((s) => s.summaryError);
  const analyticsError = useFinanceStore((s) => s.analyticsError);
  const lastUpdatedAt = useFinanceStore((s) => s.lastUpdatedAt);
  const refreshAll = useFinanceStore((s) => s.refreshAll);
  const setOverviewQuery = useFinanceStore((s) => s.setOverviewQuery);
  const overlay = useDemoSimulationStore((s) => s.financeOverlay);
  const simulationEnabledActive = useDemoSimulationStore((s) => s.active);
  const simulationActive = Boolean(overlay) && simulationEnabledActive;

  useEffect(() => {
    if (isAllowed) void loadFinancePageData();
  }, [isAllowed]);

  const period = resolveFinancePeriodRange(
    overviewQuery.preset,
    overviewQuery.customFrom,
    overviewQuery.customTo,
  );
  const displaySummary = overlay
    ? deriveFinanceSummary(overlay, period.from, period.to)
    : summary;
  const displayAnalytics = overlay
    ? deriveFinanceAnalytics(overlay, period.from, period.to)
    : analytics;

  return useMemo(
    () => ({
      isAllowed,
      canManageExpenses,
      simulationActive,
      summary: displaySummary,
      analytics: displayAnalytics,
      overviewQuery,
      lastUpdatedAt: overlay ? overlay.generatedAt : lastUpdatedAt,
      isSummaryLoading:
        !overlay &&
        (summaryStatus === "loading" || (isAllowed && summaryStatus === "idle")),
      isAnalyticsLoading:
        !overlay &&
        (analyticsStatus === "loading" || (isAllowed && analyticsStatus === "idle")),
      isSummaryReady: Boolean(overlay) || summaryStatus === "ready",
      isAnalyticsReady: Boolean(overlay) || analyticsStatus === "ready",
      summaryError: overlay ? null : summaryStatus === "error" ? summaryError : null,
      analyticsError: overlay ? null : analyticsStatus === "error" ? analyticsError : null,
      refresh: refreshAll,
      setPeriodPreset: (preset: FinancePeriodPreset) => {
        setOverviewQuery({ preset });
      },
      setCustomPeriod: (customFrom: string, customTo: string) => {
        setOverviewQuery({ preset: "custom", customFrom, customTo });
      },
    }),
    [
      isAllowed,
      canManageExpenses,
      simulationActive,
      displaySummary,
      displayAnalytics,
      overviewQuery,
      lastUpdatedAt,
      overlay,
      summaryStatus,
      analyticsStatus,
      summaryError,
      analyticsError,
      refreshAll,
      setOverviewQuery,
    ],
  );
}

export function useFinanceReceivables() {
  const receivables = useFinanceStore((s) => s.receivables);
  const meta = useFinanceStore((s) => s.receivablesMeta);
  const query = useFinanceStore((s) => s.receivablesQuery);
  const status = useFinanceStore((s) => s.receivablesStatus);
  const error = useFinanceStore((s) => s.receivablesError);
  const setReceivablesQuery = useFinanceStore((s) => s.setReceivablesQuery);
  const resetReceivablesFilters = useFinanceStore((s) => s.resetReceivablesFilters);
  const overlay = useDemoSimulationStore((s) => s.financeOverlay);
  const simulated = overlay ? filterSimulatedReceivables(overlay, query) : null;

  return useMemo(
    () => ({
      items: simulated ? simulated.data : receivables,
      meta: simulated ? simulated.meta : meta,
      query,
      isLoading: !overlay && (status === "loading" || status === "idle"),
      isReady: Boolean(overlay) || status === "ready",
      error: overlay ? null : status === "error" ? error : null,
      applySearch: (search: string) => {
        setReceivablesQuery({ search: search.trim(), page: 1 });
      },
      clearSearch: () => {
        setReceivablesQuery({ search: "", page: 1 });
      },
      setSourceType: (sourceType: OpenReceivableSourceType | null) => {
        setReceivablesQuery({ sourceType, page: 1 });
      },
      setSort: (sort: ReceivableSortKey) => {
        setReceivablesQuery({ sort, page: 1 });
      },
      setPage: (page: number) => {
        setReceivablesQuery({ page });
      },
      clearFilters: resetReceivablesFilters,
    }),
    [
      simulated,
      receivables,
      meta,
      query,
      overlay,
      status,
      error,
      setReceivablesQuery,
      resetReceivablesFilters,
    ],
  );
}

export function useFinanceLedger() {
  const locale = useLocale();
  const ledger = useFinanceStore((s) => s.ledger);
  const meta = useFinanceStore((s) => s.ledgerMeta);
  const query = useFinanceStore((s) => s.ledgerQuery);
  const status = useFinanceStore((s) => s.ledgerStatus);
  const error = useFinanceStore((s) => s.ledgerError);
  const setLedgerQuery = useFinanceStore((s) => s.setLedgerQuery);
  const resetLedgerFilters = useFinanceStore((s) => s.resetLedgerFilters);
  const overlay = useDemoSimulationStore((s) => s.financeOverlay);
  const simulated = overlay ? filterSimulatedLedger(overlay, query, locale) : null;

  return useMemo(
    () => ({
      items: simulated ? simulated.data : ledger,
      meta: simulated ? simulated.meta : meta,
      query,
      isLoading: !overlay && (status === "loading" || status === "idle"),
      isReady: Boolean(overlay) || status === "ready",
      error: overlay ? null : status === "error" ? error : null,
      applySearch: (search: string) => {
        setLedgerQuery({ search: search.trim(), page: 1 });
      },
      clearSearch: () => {
        setLedgerQuery({ search: "", page: 1 });
      },
      setDirection: (direction: LedgerDirection | null) => {
        const mapped = toLedgerApiFilters(direction, query.displaySource);
        setLedgerQuery({ ...mapped, page: 1 });
      },
      setSource: (source: LedgerDisplaySource | null) => {
        const mapped = toLedgerApiFilters(query.direction, source);
        setLedgerQuery({ displaySource: source, ...mapped, page: 1 });
      },
      setPage: (page: number) => {
        setLedgerQuery({ page });
      },
      clearFilters: resetLedgerFilters,
    }),
    [
      simulated,
      ledger,
      meta,
      query,
      overlay,
      status,
      error,
      setLedgerQuery,
      resetLedgerFilters,
    ],
  );
}

export function useFinanceExpense() {
  const detail = useFinanceStore((s) => s.expenseDetail);
  const detailId = useFinanceStore((s) => s.expenseDetailId);
  const detailStatus = useFinanceStore((s) => s.expenseDetailStatus);
  const detailError = useFinanceStore((s) => s.expenseDetailError);
  const isCreating = useFinanceStore((s) => s.isCreatingExpense);
  const createError = useFinanceStore((s) => s.createExpenseError);
  const isVoiding = useFinanceStore((s) => s.isVoidingExpense);
  const voidError = useFinanceStore((s) => s.voidExpenseError);
  const isCorrecting = useFinanceStore((s) => s.isCorrectingExpense);
  const correctError = useFinanceStore((s) => s.correctExpenseError);
  const fetchExpenseDetail = useFinanceStore((s) => s.fetchExpenseDetail);
  const clearExpenseDetail = useFinanceStore((s) => s.clearExpenseDetail);
  const createExpense = useFinanceStore((s) => s.createExpense);
  const voidExpense = useFinanceStore((s) => s.voidExpense);
  const correctExpense = useFinanceStore((s) => s.correctExpense);
  const clearCreateExpenseError = useFinanceStore((s) => s.clearCreateExpenseError);
  const clearVoidExpenseError = useFinanceStore((s) => s.clearVoidExpenseError);
  const clearCorrectExpenseError = useFinanceStore((s) => s.clearCorrectExpenseError);

  const overlay = useDemoSimulationStore((s) => s.financeOverlay);
  const overlayDetail =
    overlay && detailId && overlay.expenses[detailId] ? overlay.expenses[detailId] : null;

  return useMemo(
    () => ({
      detail: overlayDetail ?? detail,
      detailId,
      isDetailLoading:
        !overlayDetail &&
        (detailStatus === "loading" || (detailId != null && detailStatus === "idle")),
      isDetailReady: Boolean(overlayDetail) || detailStatus === "ready",
      detailError:
        overlayDetail || (detailId && isSimulatedFinanceId(detailId))
          ? null
          : detailStatus === "error"
            ? detailError
            : null,
      fetchDetail: fetchExpenseDetail,
      clearDetail: clearExpenseDetail,
      createExpense,
      isCreating,
      createError,
      clearCreateError: clearCreateExpenseError,
      voidExpense,
      isVoiding,
      voidError,
      clearVoidError: clearVoidExpenseError,
      correctExpense,
      isCorrecting,
      correctError,
      clearCorrectError: clearCorrectExpenseError,
    }),
    [
      overlayDetail,
      detail,
      detailId,
      detailStatus,
      detailError,
      isCreating,
      createError,
      isVoiding,
      voidError,
      isCorrecting,
      correctError,
      fetchExpenseDetail,
      clearExpenseDetail,
      createExpense,
      voidExpense,
      correctExpense,
      clearCreateExpenseError,
      clearVoidExpenseError,
      clearCorrectExpenseError,
    ],
  );
}

export type {
  FinanceSummaryDto,
  FinanceAnalyticsDto,
  OpenReceivableDto,
  LedgerEntryDto,
  ManualExpenseDetailDto,
  CreateManualExpensePayload,
  VoidManualExpensePayload,
  CorrectManualExpensePayload,
  PageMeta,
  ApiRequestError,
};
