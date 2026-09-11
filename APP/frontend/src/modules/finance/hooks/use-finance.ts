"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
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
  LedgerEntryDto,
  LedgerKind,
  LedgerSourceType,
  ManualExpenseDetailDto,
  OpenReceivableDto,
  OpenReceivableSourceType,
  ReceivableSortKey,
  VoidManualExpensePayload,
} from "../types/finance.types";

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

  useEffect(() => {
    if (isAllowed) void loadFinancePageData();
  }, [isAllowed]);

  return useMemo(
    () => ({
      isAllowed,
      canManageExpenses,
      summary,
      analytics,
      overviewQuery,
      lastUpdatedAt,
      isSummaryLoading:
        summaryStatus === "loading" || (isAllowed && summaryStatus === "idle"),
      isAnalyticsLoading:
        analyticsStatus === "loading" || (isAllowed && analyticsStatus === "idle"),
      isSummaryReady: summaryStatus === "ready",
      isAnalyticsReady: analyticsStatus === "ready",
      summaryError: summaryStatus === "error" ? summaryError : null,
      analyticsError: analyticsStatus === "error" ? analyticsError : null,
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
      summary,
      analytics,
      overviewQuery,
      lastUpdatedAt,
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

  return useMemo(
    () => ({
      items: receivables,
      meta,
      query,
      isLoading: status === "loading" || status === "idle",
      isReady: status === "ready",
      error: status === "error" ? error : null,
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
      receivables,
      meta,
      query,
      status,
      error,
      setReceivablesQuery,
      resetReceivablesFilters,
    ],
  );
}

export function useFinanceLedger() {
  const ledger = useFinanceStore((s) => s.ledger);
  const meta = useFinanceStore((s) => s.ledgerMeta);
  const query = useFinanceStore((s) => s.ledgerQuery);
  const status = useFinanceStore((s) => s.ledgerStatus);
  const error = useFinanceStore((s) => s.ledgerError);
  const setLedgerQuery = useFinanceStore((s) => s.setLedgerQuery);
  const resetLedgerFilters = useFinanceStore((s) => s.resetLedgerFilters);

  return useMemo(
    () => ({
      items: ledger,
      meta,
      query,
      isLoading: status === "loading" || status === "idle",
      isReady: status === "ready",
      error: status === "error" ? error : null,
      applySearch: (search: string) => {
        setLedgerQuery({ search: search.trim(), page: 1 });
      },
      clearSearch: () => {
        setLedgerQuery({ search: "", page: 1 });
      },
      setDirection: (direction: LedgerDirection | null) => {
        setLedgerQuery({ direction, page: 1 });
      },
      setKind: (kind: LedgerKind | null) => {
        setLedgerQuery({ kind, page: 1 });
      },
      setSourceType: (sourceType: LedgerSourceType | null) => {
        setLedgerQuery({ sourceType, page: 1 });
      },
      setPage: (page: number) => {
        setLedgerQuery({ page });
      },
      clearFilters: resetLedgerFilters,
    }),
    [ledger, meta, query, status, error, setLedgerQuery, resetLedgerFilters],
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

  return useMemo(
    () => ({
      detail,
      detailId,
      isDetailLoading:
        detailStatus === "loading" || (detailId != null && detailStatus === "idle"),
      isDetailReady: detailStatus === "ready",
      detailError: detailStatus === "error" ? detailError : null,
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
