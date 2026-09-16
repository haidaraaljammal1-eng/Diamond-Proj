"use client";

import { create } from "zustand";
import { useDemoSimulationStore } from "@/modules/demo-simulation/simulation.store";
import { ApiRequestError, normalizeApiError } from "@/infrastructure/api/errors";
import {
  correctManualExpense,
  createManualExpense,
  getFinanceAnalytics,
  getFinanceLedger,
  getFinanceSummary,
  getManualExpense,
  getOpenReceivables,
  voidManualExpense,
} from "../api/finance.api";
import {
  FINANCE_LEDGER_PAGE_SIZE,
  FINANCE_RECEIVABLES_PAGE_SIZE,
  type PageMeta,
} from "../api/finance.api.types";
import type {
  CorrectManualExpensePayload,
  CreateManualExpensePayload,
  FinanceAnalyticsDto,
  FinancePeriodPreset,
  FinanceSummaryDto,
  LedgerEntryDto,
  LedgerQuery,
  ManualExpenseDetailDto,
  OpenReceivableDto,
  OpenReceivablesQuery,
  VoidManualExpensePayload,
} from "../types/finance.types";
import { resolveFinancePeriodRange } from "../utils/finance-period";
import { applySimulatedManualExpenseCorrection } from "../utils/finance-simulation";

export type FinanceLoadStatus = "idle" | "loading" | "ready" | "error";

export interface FinanceOverviewQuery {
  preset: FinancePeriodPreset;
  customFrom: string;
  customTo: string;
}

interface FinanceState {
  overviewQuery: FinanceOverviewQuery;
  summary: FinanceSummaryDto | null;
  analytics: FinanceAnalyticsDto | null;
  summaryStatus: FinanceLoadStatus;
  analyticsStatus: FinanceLoadStatus;
  summaryError: ApiRequestError | null;
  analyticsError: ApiRequestError | null;
  lastUpdatedAt: string | null;
  receivables: OpenReceivableDto[];
  receivablesMeta: PageMeta | null;
  receivablesQuery: OpenReceivablesQuery;
  receivablesStatus: FinanceLoadStatus;
  receivablesError: ApiRequestError | null;
  ledger: LedgerEntryDto[];
  ledgerMeta: PageMeta | null;
  ledgerQuery: LedgerQuery;
  ledgerStatus: FinanceLoadStatus;
  ledgerError: ApiRequestError | null;
  expenseDetail: ManualExpenseDetailDto | null;
  expenseDetailId: string | null;
  expenseDetailStatus: FinanceLoadStatus;
  expenseDetailError: ApiRequestError | null;
  isCreatingExpense: boolean;
  createExpenseError: ApiRequestError | null;
  isVoidingExpense: boolean;
  voidExpenseError: ApiRequestError | null;
  isCorrectingExpense: boolean;
  correctExpenseError: ApiRequestError | null;
  loadOverview: () => Promise<void>;
  refreshAll: () => Promise<void>;
  setOverviewQuery: (partial: Partial<FinanceOverviewQuery>) => void;
  setReceivablesQuery: (partial: Partial<OpenReceivablesQuery>) => void;
  resetReceivablesFilters: () => void;
  setLedgerQuery: (partial: Partial<LedgerQuery>) => void;
  resetLedgerFilters: () => void;
  fetchExpenseDetail: (id: string) => Promise<void>;
  clearExpenseDetail: () => void;
  createExpense: (payload: CreateManualExpensePayload) => Promise<boolean>;
  voidExpense: (id: string, payload: VoidManualExpensePayload) => Promise<boolean>;
  correctExpense: (
    id: string,
    payload: CorrectManualExpensePayload,
  ) => Promise<boolean>;
  clearCreateExpenseError: () => void;
  clearVoidExpenseError: () => void;
  clearCorrectExpenseError: () => void;
}

function isFinanceSimulating(): boolean {
  return Boolean(useDemoSimulationStore.getState().financeOverlay);
}

let overviewInFlight: Promise<void> | null = null;
let receivablesInFlight: Promise<void> | null = null;
let ledgerInFlight: Promise<void> | null = null;
let ledgerFetchQueued = false;
let expenseDetailInFlight: Promise<void> | null = null;

const DEFAULT_OVERVIEW_QUERY: FinanceOverviewQuery = {
  preset: "month",
  customFrom: "",
  customTo: "",
};

const DEFAULT_RECEIVABLES_QUERY: OpenReceivablesQuery = {
  page: 1,
  pageSize: FINANCE_RECEIVABLES_PAGE_SIZE,
  search: "",
  sourceType: null,
  sort: "obligationCreatedAt:desc",
};

function buildLedgerQueryFromOverview(
  overview: FinanceOverviewQuery,
): LedgerQuery {
  const period = resolveFinancePeriodRange(
    overview.preset,
    overview.customFrom,
    overview.customTo,
  );
  return {
    page: 1,
    pageSize: FINANCE_LEDGER_PAGE_SIZE,
    search: "",
    from: period.from,
    to: period.to,
    displaySource: null,
    kind: null,
    sourceType: null,
    direction: null,
    sort: "occurredAt:desc",
  };
}

export const useFinanceStore = create<FinanceState>((set, get) => {
  async function fetchOverview(): Promise<void> {
    if (isFinanceSimulating()) {
      set({
        summaryStatus: "ready",
        analyticsStatus: "ready",
        summaryError: null,
        analyticsError: null,
        lastUpdatedAt: new Date().toISOString(),
      });
      return;
    }
    const { overviewQuery } = get();
    const period = resolveFinancePeriodRange(
      overviewQuery.preset,
      overviewQuery.customFrom,
      overviewQuery.customTo,
    );
    set({
      summaryStatus: "loading",
      analyticsStatus: "loading",
      summaryError: null,
      analyticsError: null,
    });

    const [summaryResult, analyticsResult] = await Promise.allSettled([
      getFinanceSummary(period.from, period.to),
      getFinanceAnalytics(period.from, period.to),
    ]);

    const patch: Partial<FinanceState> = {
      lastUpdatedAt: new Date().toISOString(),
    };

    if (summaryResult.status === "fulfilled") {
      patch.summary = summaryResult.value;
      patch.summaryStatus = "ready";
      patch.summaryError = null;
    } else {
      patch.summaryStatus = "error";
      patch.summaryError = normalizeApiError(summaryResult.reason);
    }

    if (analyticsResult.status === "fulfilled") {
      patch.analytics = analyticsResult.value;
      patch.analyticsStatus = "ready";
      patch.analyticsError = null;
    } else {
      patch.analyticsStatus = "error";
      patch.analyticsError = normalizeApiError(analyticsResult.reason);
    }

    set(patch);
  }

  async function fetchReceivables(): Promise<void> {
    if (isFinanceSimulating()) {
      set({ receivablesStatus: "ready", receivablesError: null });
      return;
    }
    const { receivablesQuery } = get();
    set({ receivablesStatus: "loading", receivablesError: null });
    try {
      const result = await getOpenReceivables(receivablesQuery);
      set({
        receivables: result.data,
        receivablesMeta: result.meta,
        receivablesStatus: "ready",
        receivablesError: null,
      });
    } catch (error) {
      set({
        receivablesStatus: "error",
        receivablesError: normalizeApiError(error),
      });
    }
  }

  async function fetchLedger(): Promise<void> {
    if (isFinanceSimulating()) {
      set({ ledgerStatus: "ready", ledgerError: null });
      return;
    }
    const { ledgerQuery } = get();
    set({ ledgerStatus: "loading", ledgerError: null });
    try {
      const result = await getFinanceLedger(ledgerQuery);
      set({
        ledger: result.data,
        ledgerMeta: result.meta,
        ledgerStatus: "ready",
        ledgerError: null,
      });
    } catch (error) {
      set({
        ledgerStatus: "error",
        ledgerError: normalizeApiError(error),
      });
    }
  }

  function enqueueLedgerFetch(): Promise<void> {
    if (ledgerInFlight) {
      ledgerFetchQueued = true;
      return ledgerInFlight;
    }
    ledgerInFlight = fetchLedger().finally(() => {
      ledgerInFlight = null;
      if (ledgerFetchQueued) {
        ledgerFetchQueued = false;
        void enqueueLedgerFetch();
      }
    });
    return ledgerInFlight;
  }

  return {
    overviewQuery: DEFAULT_OVERVIEW_QUERY,
    summary: null,
    analytics: null,
    summaryStatus: "idle",
    analyticsStatus: "idle",
    summaryError: null,
    analyticsError: null,
    lastUpdatedAt: null,
    receivables: [],
    receivablesMeta: null,
    receivablesQuery: DEFAULT_RECEIVABLES_QUERY,
    receivablesStatus: "idle",
    receivablesError: null,
    ledger: [],
    ledgerMeta: null,
    ledgerQuery: buildLedgerQueryFromOverview(DEFAULT_OVERVIEW_QUERY),
    ledgerStatus: "idle",
    ledgerError: null,
    expenseDetail: null,
    expenseDetailId: null,
    expenseDetailStatus: "idle",
    expenseDetailError: null,
    isCreatingExpense: false,
    createExpenseError: null,
    isVoidingExpense: false,
    voidExpenseError: null,
    isCorrectingExpense: false,
    correctExpenseError: null,

    loadOverview: async () => {
      if (overviewInFlight) return overviewInFlight;
      overviewInFlight = fetchOverview().finally(() => {
        overviewInFlight = null;
      });
      return overviewInFlight;
    },

    refreshAll: async () => {
      await Promise.all([
        get().loadOverview(),
        (async () => {
          if (receivablesInFlight) return receivablesInFlight;
          receivablesInFlight = fetchReceivables().finally(() => {
            receivablesInFlight = null;
          });
          return receivablesInFlight;
        })(),
        enqueueLedgerFetch(),
      ]);
    },

    setOverviewQuery: (partial) => {
      const overviewQuery = { ...get().overviewQuery, ...partial };
      const ledgerQuery = {
        ...get().ledgerQuery,
        from: resolveFinancePeriodRange(
          overviewQuery.preset,
          overviewQuery.customFrom,
          overviewQuery.customTo,
        ).from,
        to: resolveFinancePeriodRange(
          overviewQuery.preset,
          overviewQuery.customFrom,
          overviewQuery.customTo,
        ).to,
        page: 1,
      };
      set({ overviewQuery, ledgerQuery });
      void get().loadOverview();
      void enqueueLedgerFetch();
    },

    setReceivablesQuery: (partial) => {
      set({ receivablesQuery: { ...get().receivablesQuery, ...partial } });
      void (async () => {
        if (receivablesInFlight) return receivablesInFlight;
        receivablesInFlight = fetchReceivables().finally(() => {
          receivablesInFlight = null;
        });
        return receivablesInFlight;
      })();
    },

    resetReceivablesFilters: () => {
      set({ receivablesQuery: { ...DEFAULT_RECEIVABLES_QUERY } });
      void (async () => {
        if (receivablesInFlight) return receivablesInFlight;
        receivablesInFlight = fetchReceivables().finally(() => {
          receivablesInFlight = null;
        });
        return receivablesInFlight;
      })();
    },

    setLedgerQuery: (partial) => {
      set({ ledgerQuery: { ...get().ledgerQuery, ...partial } });
      void enqueueLedgerFetch();
    },

    resetLedgerFilters: () => {
      const ledgerQuery = {
        ...buildLedgerQueryFromOverview(get().overviewQuery),
        search: "",
        displaySource: null,
        kind: null,
        sourceType: null,
        direction: null,
      };
      set({ ledgerQuery });
      void enqueueLedgerFetch();
    },

    fetchExpenseDetail: async (id) => {
      if (isFinanceSimulating()) {
        set({
          expenseDetailId: id,
          expenseDetailStatus: "ready",
          expenseDetailError: null,
        });
        return;
      }
      set({
        expenseDetailId: id,
        expenseDetailStatus: "loading",
        expenseDetailError: null,
      });
      if (expenseDetailInFlight) await expenseDetailInFlight;
      expenseDetailInFlight = (async () => {
        try {
          const detail = await getManualExpense(id);
          set({
            expenseDetail: detail,
            expenseDetailStatus: "ready",
            expenseDetailError: null,
          });
        } catch (error) {
          set({
            expenseDetailStatus: "error",
            expenseDetailError: normalizeApiError(error),
          });
        }
      })().finally(() => {
        expenseDetailInFlight = null;
      });
      return expenseDetailInFlight;
    },

    clearExpenseDetail: () => {
      set({
        expenseDetail: null,
        expenseDetailId: null,
        expenseDetailStatus: "idle",
        expenseDetailError: null,
      });
    },

    createExpense: async (payload) => {
      if (isFinanceSimulating()) return false;
      set({ isCreatingExpense: true, createExpenseError: null });
      try {
        await createManualExpense(payload);
        set({ isCreatingExpense: false, createExpenseError: null });
        await get().refreshAll();
        return true;
      } catch (error) {
        set({
          isCreatingExpense: false,
          createExpenseError: normalizeApiError(error),
        });
        return false;
      }
    },

    voidExpense: async (id, payload) => {
      if (isFinanceSimulating()) return false;
      set({ isVoidingExpense: true, voidExpenseError: null });
      try {
        const detail = await voidManualExpense(id, payload);
        set({
          isVoidingExpense: false,
          voidExpenseError: null,
          expenseDetail: detail,
          expenseDetailStatus: "ready",
        });
        await get().refreshAll();
        return true;
      } catch (error) {
        set({
          isVoidingExpense: false,
          voidExpenseError: normalizeApiError(error),
        });
        return false;
      }
    },

    correctExpense: async (id, payload) => {
      if (isFinanceSimulating()) {
        const overlay = useDemoSimulationStore.getState().financeOverlay;
        if (!overlay) return false;
        set({ isCorrectingExpense: true, correctExpenseError: null });
        const result = applySimulatedManualExpenseCorrection(overlay, id, payload);
        if (!result.ok) {
          const status =
            result.reason === "FINANCE_EXPENSE_NO_CHANGES"
              ? 422
              : result.reason === "FINANCE_EXPENSE_NOT_FOUND"
                ? 404
                : 409;
          const code =
            result.reason === "FINANCE_EXPENSE_NO_CHANGES"
              ? "VALIDATION_ERROR"
              : result.reason === "FINANCE_EXPENSE_NOT_FOUND"
                ? "NOT_FOUND"
                : "CONFLICT";
          set({
            isCorrectingExpense: false,
            correctExpenseError: new ApiRequestError(
              {
                code,
                message: result.reason,
                context: { reason: result.reason },
              },
              status,
            ),
          });
          return false;
        }
        useDemoSimulationStore.getState().patchFinanceOverlay(() => result.overlay);
        set({
          isCorrectingExpense: false,
          correctExpenseError: null,
          expenseDetail: result.detail,
          expenseDetailId: result.detail.id,
          expenseDetailStatus: "ready",
        });
        return true;
      }
      set({ isCorrectingExpense: true, correctExpenseError: null });
      try {
        const detail = await correctManualExpense(id, payload);
        set({
          isCorrectingExpense: false,
          correctExpenseError: null,
          expenseDetail: detail,
          expenseDetailId: detail.id,
          expenseDetailStatus: "ready",
        });
        await get().refreshAll();
        return true;
      } catch (error) {
        set({
          isCorrectingExpense: false,
          correctExpenseError: normalizeApiError(error),
        });
        return false;
      }
    },

    clearCreateExpenseError: () => set({ createExpenseError: null }),
    clearVoidExpenseError: () => set({ voidExpenseError: null }),
    clearCorrectExpenseError: () => set({ correctExpenseError: null }),
  };
});

export async function loadFinancePageData(): Promise<void> {
  await useFinanceStore.getState().refreshAll();
}
