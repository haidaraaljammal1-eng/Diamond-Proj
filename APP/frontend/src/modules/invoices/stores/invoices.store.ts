"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { refreshAfterPending } from "@/infrastructure/state/refresh-after-pending";
import {
  getInvoice,
  getInvoiceDeliveries,
  listInvoices,
} from "../api/invoices.api";
import type {
  InvoiceDeliveryDto,
  InvoiceDetailDto,
  InvoiceListItemDto,
  InvoicePageMeta,
  InvoicesListQuery,
} from "../types/invoices.types";
import { DEFAULT_INVOICES_QUERY } from "../utils/invoice-filters";

export type InvoicesLoadStatus = "idle" | "loading" | "ready" | "error";

interface InvoicesState {
  items: InvoiceListItemDto[];
  pagination: InvoicePageMeta | null;
  searchDraft: string;
  appliedSearch: string;
  companyCode: InvoicesListQuery["companyCode"];
  invoiceType: InvoicesListQuery["invoiceType"];
  dateRange: { from: string; to: string };
  query: InvoicesListQuery;
  selectedInvoiceId: string | null;
  selectedDetail: InvoiceDetailDto | null;
  deliveries: InvoiceDeliveryDto[];
  detailOpen: boolean;
  listLoading: boolean;
  detailLoading: boolean;
  deliveriesLoading: boolean;
  listError: ApiRequestError | null;
  detailError: ApiRequestError | null;
  deliveriesError: ApiRequestError | null;
  listStatus: InvoicesLoadStatus;
  detailStatus: InvoicesLoadStatus;
  deliveriesStatus: InvoicesLoadStatus;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<InvoicesListQuery>) => void;
  setSearchDraft: (value: string) => void;
  applySearch: (search: string) => void;
  clearSearch: () => void;
  setCompanyCode: (code: InvoicesListQuery["companyCode"]) => void;
  setInvoiceType: (type: InvoicesListQuery["invoiceType"]) => void;
  setDateRange: (from: string, to: string) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  selectInvoice: (id: string) => void;
  closeDetail: () => void;
  patchListItemDeliveryStatus: (id: string, status: string | null) => void;
  reloadDetailAndDeliveries: () => Promise<void>;
}

let listInFlight: Promise<void> | null = null;
let listRequestId = 0;
let detailRequestId = 0;
let deliveriesRequestId = 0;

function queryFromState(state: InvoicesState): InvoicesListQuery {
  return {
    search: state.appliedSearch,
    companyCode: state.companyCode,
    invoiceType: state.invoiceType,
    dateFrom: state.dateRange.from,
    dateTo: state.dateRange.to,
    page: state.query.page,
    pageSize: state.query.pageSize,
  };
}

async function loadList(
  get: () => InvoicesState,
  set: (partial: Partial<InvoicesState>) => void,
) {
  const requestId = ++listRequestId;
  const run = (async () => {
    set({ listStatus: "loading", listLoading: true, listError: null });
    try {
      const result = await listInvoices(queryFromState(get()));
      if (requestId !== listRequestId) return;
      set({
        items: result.data,
        pagination: result.meta,
        listStatus: "ready",
        listLoading: false,
        listError: null,
      });
    } catch (error) {
      if (requestId !== listRequestId) return;
      set({
        listStatus: "error",
        listLoading: false,
        listError: normalizeApiError(error),
      });
    }
  })();
  listInFlight = run;
  await run;
  if (listInFlight === run) listInFlight = null;
}

function runList(
  get: () => InvoicesState,
  set: (partial: Partial<InvoicesState>) => void,
) {
  return listInFlight ?? loadList(get, set);
}

function refreshList(
  get: () => InvoicesState,
  set: (partial: Partial<InvoicesState>) => void,
) {
  return refreshAfterPending(() => listInFlight, () => runList(get, set));
}

async function loadDetail(
  id: string,
  set: (partial: Partial<InvoicesState>) => void,
) {
  const requestId = ++detailRequestId;
  set({ detailStatus: "loading", detailLoading: true, detailError: null });
  try {
    const detail = await getInvoice(id);
    if (requestId !== detailRequestId) return;
    set({
      selectedDetail: detail,
      detailStatus: "ready",
      detailLoading: false,
      detailError: null,
    });
  } catch (error) {
    if (requestId !== detailRequestId) return;
    set({
      detailStatus: "error",
      detailLoading: false,
      detailError: normalizeApiError(error),
      selectedDetail: null,
    });
  }
}

async function loadDeliveries(
  id: string,
  set: (partial: Partial<InvoicesState>) => void,
) {
  const requestId = ++deliveriesRequestId;
  set({ deliveriesStatus: "loading", deliveriesLoading: true, deliveriesError: null });
  try {
    const deliveries = await getInvoiceDeliveries(id);
    if (requestId !== deliveriesRequestId) return;
    set({
      deliveries,
      deliveriesStatus: "ready",
      deliveriesLoading: false,
      deliveriesError: null,
    });
  } catch (error) {
    if (requestId !== deliveriesRequestId) return;
    set({
      deliveriesStatus: "error",
      deliveriesLoading: false,
      deliveriesError: normalizeApiError(error),
      deliveries: [],
    });
  }
}

export const useInvoicesStore = create<InvoicesState>((set, get) => ({
  items: [],
  pagination: null,
  searchDraft: "",
  appliedSearch: "",
  companyCode: "ALL",
  invoiceType: "ALL",
  dateRange: { from: "", to: "" },
  query: DEFAULT_INVOICES_QUERY,
  selectedInvoiceId: null,
  selectedDetail: null,
  deliveries: [],
  detailOpen: false,
  listLoading: false,
  detailLoading: false,
  deliveriesLoading: false,
  listError: null,
  detailError: null,
  deliveriesError: null,
  listStatus: "idle",
  detailStatus: "idle",
  deliveriesStatus: "idle",

  async load() {
    await runList(get, set);
  },

  async refresh() {
    await refreshList(get, set);
    const { selectedInvoiceId, detailOpen } = get();
    if (selectedInvoiceId && detailOpen) {
      await Promise.allSettled([
        loadDetail(selectedInvoiceId, set),
        loadDeliveries(selectedInvoiceId, set),
      ]);
    }
  },

  setQuery(partial) {
    set((state) => ({
      query: { ...state.query, ...partial },
    }));
    void runList(get, set);
  },

  setSearchDraft(value) {
    set({ searchDraft: value });
  },

  applySearch(search) {
    set((state) => ({
      appliedSearch: search.trim(),
      searchDraft: search.trim(),
      query: { ...state.query, page: 1 },
    }));
    void runList(get, set);
  },

  clearSearch() {
    set((state) => ({
      appliedSearch: "",
      searchDraft: "",
      query: { ...state.query, page: 1 },
    }));
    void runList(get, set);
  },

  setCompanyCode(code) {
    set((state) => ({
      companyCode: code,
      query: { ...state.query, page: 1 },
    }));
    void runList(get, set);
  },

  setInvoiceType(type) {
    set((state) => ({
      invoiceType: type,
      query: { ...state.query, page: 1 },
    }));
    void runList(get, set);
  },

  setDateRange(from, to) {
    set((state) => ({
      dateRange: { from, to },
      query: { ...state.query, page: 1 },
    }));
    void runList(get, set);
  },

  resetFilters() {
    set({
      searchDraft: "",
      appliedSearch: "",
      companyCode: "ALL",
      invoiceType: "ALL",
      dateRange: { from: "", to: "" },
      query: DEFAULT_INVOICES_QUERY,
    });
    void runList(get, set);
  },

  setPage(page) {
    set((state) => ({
      query: { ...state.query, page },
    }));
    void runList(get, set);
  },

  selectInvoice(id) {
    set({
      selectedInvoiceId: id,
      detailOpen: true,
      selectedDetail: null,
      deliveries: [],
    });
    void loadDetail(id, set);
    void loadDeliveries(id, set);
  },

  closeDetail() {
    detailRequestId += 1;
    deliveriesRequestId += 1;
    set({
      detailOpen: false,
      selectedInvoiceId: null,
      selectedDetail: null,
      deliveries: [],
      detailLoading: false,
      deliveriesLoading: false,
      detailError: null,
      deliveriesError: null,
      detailStatus: "idle",
      deliveriesStatus: "idle",
    });
  },

  patchListItemDeliveryStatus(id, status) {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, latestDeliveryStatus: status as typeof item.latestDeliveryStatus } : item,
      ),
    }));
  },

  async reloadDetailAndDeliveries() {
    const id = get().selectedInvoiceId;
    if (!id) return;
    await Promise.allSettled([loadDetail(id, set), loadDeliveries(id, set)]);
    const detail = get().selectedDetail;
    if (detail) {
      const latest = detail.deliveriesSummary[0]?.status ?? null;
      get().patchListItemDeliveryStatus(id, latest);
    }
  },
}));
