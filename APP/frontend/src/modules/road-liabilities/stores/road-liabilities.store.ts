"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { refreshAfterPending } from "@/infrastructure/state/refresh-after-pending";
import {
  getRoadLiabilities,
  getRoadLiabilitiesSummary,
  getRoadLiability,
} from "../api/road-liabilities.api";
import type {
  RoadLiabilitiesListQuery,
  RoadLiabilityDetailDto,
  RoadLiabilityListItemDto,
  RoadLiabilityPageMeta,
  RoadLiabilitySummaryDto,
} from "../types/road-liabilities.types";
import { DEFAULT_ROAD_LIABILITIES_QUERY } from "../utils/road-liability-filters";
import { isSimulatedRoadLiabilityId } from "../utils/road-liability-status";

export type RoadLiabilitiesLoadStatus = "idle" | "loading" | "ready" | "error";

interface RoadLiabilitiesState {
  summary: RoadLiabilitySummaryDto | null;
  items: RoadLiabilityListItemDto[];
  pagination: RoadLiabilityPageMeta | null;
  searchDraft: string;
  appliedSearch: string;
  queueFilter: RoadLiabilitiesListQuery["queue"];
  channelFilter: RoadLiabilitiesListQuery["channel"];
  typeFilter: RoadLiabilitiesListQuery["type"];
  sourceFilter: RoadLiabilitiesListQuery["sourceKey"];
  confirmationStatusFilter: RoadLiabilitiesListQuery["confirmationStatus"];
  attributionStatusFilter: RoadLiabilitiesListQuery["attributionStatus"];
  collectionStatusFilter: RoadLiabilitiesListQuery["collectionStatus"];
  dateRange: { from: string; to: string };
  query: RoadLiabilitiesListQuery;
  selectedLiabilityId: string | null;
  selectedDetail: RoadLiabilityDetailDto | null;
  detailOpen: boolean;
  summaryLoading: boolean;
  listLoading: boolean;
  detailLoading: boolean;
  summaryError: ApiRequestError | null;
  listError: ApiRequestError | null;
  detailError: ApiRequestError | null;
  summaryStatus: RoadLiabilitiesLoadStatus;
  listStatus: RoadLiabilitiesLoadStatus;
  detailStatus: RoadLiabilitiesLoadStatus;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<RoadLiabilitiesListQuery>) => void;
  setSearchDraft: (value: string) => void;
  resetFilters: () => void;
  selectLiability: (id: string) => void;
  selectLocalDetail: (id: string, detail: RoadLiabilityDetailDto) => void;
  closeDetail: () => void;
  clearSelection: () => void;
}

let listInFlight: Promise<void> | null = null;
let summaryInFlight: Promise<void> | null = null;
let detailInFlight: Promise<void> | null = null;
let detailRequestId = 0;

function queryFromState(state: RoadLiabilitiesState): RoadLiabilitiesListQuery {
  return {
    search: state.appliedSearch,
    queue: state.queueFilter,
    channel: state.channelFilter,
    type: state.typeFilter,
    sourceKey: state.sourceFilter,
    confirmationStatus: state.confirmationStatusFilter,
    attributionStatus: state.attributionStatusFilter,
    collectionStatus: state.collectionStatusFilter,
    from: state.dateRange.from,
    to: state.dateRange.to,
    page: state.query.page,
    pageSize: state.query.pageSize,
  };
}

async function loadSummary(set: (partial: Partial<RoadLiabilitiesState>) => void) {
  const run = (async () => {
    set({
      summaryStatus: "loading",
      summaryLoading: true,
      summaryError: null,
    });
    try {
      const summary = await getRoadLiabilitiesSummary();
      set({
        summary,
        summaryStatus: "ready",
        summaryLoading: false,
        summaryError: null,
      });
    } catch (error) {
      set({
        summaryStatus: "error",
        summaryLoading: false,
        summaryError: normalizeApiError(error),
      });
    }
  })();
  summaryInFlight = run;
  await run;
  if (summaryInFlight === run) summaryInFlight = null;
}

async function loadList(
  get: () => RoadLiabilitiesState,
  set: (partial: Partial<RoadLiabilitiesState>) => void,
) {
  const run = (async () => {
    set({ listStatus: "loading", listLoading: true, listError: null });
    try {
      const result = await getRoadLiabilities(queryFromState(get()));
      set({
        items: result.data,
        pagination: result.meta,
        listStatus: "ready",
        listLoading: false,
        listError: null,
      });
    } catch (error) {
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

function runSummary(set: (partial: Partial<RoadLiabilitiesState>) => void) {
  return summaryInFlight ?? loadSummary(set);
}

function runList(
  get: () => RoadLiabilitiesState,
  set: (partial: Partial<RoadLiabilitiesState>) => void,
) {
  return listInFlight ?? loadList(get, set);
}

function refreshSummary(set: (partial: Partial<RoadLiabilitiesState>) => void) {
  return refreshAfterPending(() => summaryInFlight, () => runSummary(set));
}

function refreshList(
  get: () => RoadLiabilitiesState,
  set: (partial: Partial<RoadLiabilitiesState>) => void,
) {
  return refreshAfterPending(() => listInFlight, () => runList(get, set));
}

async function loadDetail(
  id: string,
  set: (partial: Partial<RoadLiabilitiesState>) => void,
) {
  if (isSimulatedRoadLiabilityId(id)) return;
  const requestId = ++detailRequestId;
  const run = (async () => {
    set({ detailStatus: "loading", detailLoading: true, detailError: null });
    try {
      const detail = await getRoadLiability(id);
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
  })();
  detailInFlight = run;
  await run;
  if (detailInFlight === run) detailInFlight = null;
}

export const useRoadLiabilitiesStore = create<RoadLiabilitiesState>((set, get) => ({
  summary: null,
  items: [],
  pagination: null,
  searchDraft: "",
  appliedSearch: "",
  queueFilter: "all",
  channelFilter: "all",
  typeFilter: "all",
  sourceFilter: "all",
  confirmationStatusFilter: "all",
  attributionStatusFilter: "all",
  collectionStatusFilter: "all",
  dateRange: { from: "", to: "" },
  query: DEFAULT_ROAD_LIABILITIES_QUERY,
  selectedLiabilityId: null,
  selectedDetail: null,
  detailOpen: false,
  summaryLoading: false,
  listLoading: false,
  detailLoading: false,
  summaryError: null,
  listError: null,
  detailError: null,
  summaryStatus: "idle",
  listStatus: "idle",
  detailStatus: "idle",

  async load() {
    await Promise.allSettled([runSummary(set), runList(get, set)]);
  },

  async refresh() {
    const selectedId = get().selectedLiabilityId;
    const detailOpen = get().detailOpen;
    await Promise.allSettled([refreshSummary(set), refreshList(get, set)]);
    if (selectedId && detailOpen && !isSimulatedRoadLiabilityId(selectedId)) {
      await loadDetail(selectedId, set);
    }
  },

  setQuery(partial) {
    const current = get();
    const nextQuery: RoadLiabilitiesListQuery = {
      ...queryFromState(current),
      ...partial,
    };
    set({
      query: nextQuery,
      appliedSearch: nextQuery.search,
      searchDraft: partial.search === undefined ? current.searchDraft : nextQuery.search,
      queueFilter: nextQuery.queue,
      channelFilter: nextQuery.channel,
      typeFilter: nextQuery.type,
      sourceFilter: nextQuery.sourceKey,
      confirmationStatusFilter: nextQuery.confirmationStatus,
      attributionStatusFilter: nextQuery.attributionStatus,
      collectionStatusFilter: nextQuery.collectionStatus,
      dateRange: { from: nextQuery.from, to: nextQuery.to },
    });
    void refreshList(get, set);
  },

  setSearchDraft(value) {
    set({ searchDraft: value });
  },

  resetFilters() {
    set({
      query: DEFAULT_ROAD_LIABILITIES_QUERY,
      appliedSearch: "",
      searchDraft: "",
      queueFilter: "all",
      channelFilter: "all",
      typeFilter: "all",
      sourceFilter: "all",
      confirmationStatusFilter: "all",
      attributionStatusFilter: "all",
      collectionStatusFilter: "all",
      dateRange: { from: "", to: "" },
    });
    void refreshList(get, set);
  },

  selectLiability(id) {
    const same = get().selectedLiabilityId === id;
    set({
      selectedLiabilityId: id,
      selectedDetail: same ? get().selectedDetail : null,
      detailStatus: "loading",
      detailLoading: !isSimulatedRoadLiabilityId(id),
      detailError: same ? get().detailError : null,
      detailOpen: true,
    });
    if (!isSimulatedRoadLiabilityId(id)) {
      void loadDetail(id, set);
    }
  },

  selectLocalDetail(id, detail) {
    detailRequestId += 1;
    set({
      selectedLiabilityId: id,
      selectedDetail: detail,
      detailStatus: "ready",
      detailLoading: false,
      detailError: null,
      detailOpen: true,
    });
  },

  closeDetail() {
    set({ detailOpen: false });
  },

  clearSelection() {
    detailRequestId += 1;
    set({
      selectedLiabilityId: null,
      selectedDetail: null,
      detailStatus: "idle",
      detailLoading: false,
      detailError: null,
      detailOpen: false,
    });
  },
}));
