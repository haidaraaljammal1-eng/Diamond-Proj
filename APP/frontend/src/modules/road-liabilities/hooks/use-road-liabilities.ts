"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import { useDemoSimulationStore } from "@/modules/demo-simulation/simulation.store";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { ROAD_LIABILITIES_PAGE_PERMISSIONS } from "../road-liabilities.permissions";
import { useRoadLiabilitiesStore } from "../stores/road-liabilities.store";
import type {
  RoadLiabilitiesListQuery,
  RoadLiabilityAttributionFilter,
  RoadLiabilityChannelFilter,
  RoadLiabilityCollectionFilter,
  RoadLiabilityConfirmationFilter,
  RoadLiabilityQueueFilter,
  RoadLiabilityDetailDto,
  RoadLiabilityListItemDto,
  RoadLiabilityPageMeta,
  RoadLiabilitySourceFilter,
  RoadLiabilitySummaryDto,
  RoadLiabilityTypeFilter,
} from "../types/road-liabilities.types";
import {
  countRoadLiabilityAdvancedFilters,
  filterSimulatedLiabilities,
  paginateItems,
} from "../utils/road-liability-filters";
import { isSimulatedRoadLiabilityId } from "../utils/road-liability-status";

export interface UseRoadLiabilitiesResult {
  summary: RoadLiabilitySummaryDto | null;
  items: RoadLiabilityListItemDto[];
  pagination: RoadLiabilityPageMeta | null;
  query: RoadLiabilitiesListQuery;
  searchDraft: string;
  appliedSearch: string;
  activeFilterCount: number;
  selectedLiabilityId: string | null;
  selectedDetail: RoadLiabilityDetailDto | null;
  detailOpen: boolean;
  isAllowed: boolean;
  isSummaryLoading: boolean;
  isListLoading: boolean;
  isDetailLoading: boolean;
  isRefreshing: boolean;
  summaryError: ApiRequestError | null;
  listError: ApiRequestError | null;
  detailError: ApiRequestError | null;
  simulationActive: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  applySearch: (search: string) => void;
  clearSearch: () => void;
  setQueue: (queue: RoadLiabilityQueueFilter) => void;
  setChannelFilter: (channel: RoadLiabilityChannelFilter) => void;
  setTypeFilter: (type: RoadLiabilityTypeFilter) => void;
  setSourceFilter: (sourceKey: RoadLiabilitySourceFilter) => void;
  setConfirmationFilter: (status: RoadLiabilityConfirmationFilter) => void;
  setAttributionFilter: (status: RoadLiabilityAttributionFilter) => void;
  setCollectionFilter: (status: RoadLiabilityCollectionFilter) => void;
  setDateRange: (from: string, to: string) => void;
  setPage: (page: number) => void;
  clearFilters: () => void;
  selectLiability: (id: string) => void;
  closeDetail: () => void;
  clearSelection: () => void;
}

export function useRoadLiabilities(): UseRoadLiabilitiesResult {
  const { hasPermission } = usePermissions();
  const isAllowed = ROAD_LIABILITIES_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );

  const summary = useRoadLiabilitiesStore((state) => state.summary);
  const items = useRoadLiabilitiesStore((state) => state.items);
  const pagination = useRoadLiabilitiesStore((state) => state.pagination);
  const query = useRoadLiabilitiesStore((state) => state.query);
  const searchDraft = useRoadLiabilitiesStore((state) => state.searchDraft);
  const appliedSearch = useRoadLiabilitiesStore((state) => state.appliedSearch);
  const selectedLiabilityId = useRoadLiabilitiesStore((state) => state.selectedLiabilityId);
  const selectedDetail = useRoadLiabilitiesStore((state) => state.selectedDetail);
  const detailOpen = useRoadLiabilitiesStore((state) => state.detailOpen);
  const summaryStatus = useRoadLiabilitiesStore((state) => state.summaryStatus);
  const listStatus = useRoadLiabilitiesStore((state) => state.listStatus);
  const detailStatus = useRoadLiabilitiesStore((state) => state.detailStatus);
  const summaryError = useRoadLiabilitiesStore((state) => state.summaryError);
  const listError = useRoadLiabilitiesStore((state) => state.listError);
  const detailError = useRoadLiabilitiesStore((state) => state.detailError);
  const load = useRoadLiabilitiesStore((state) => state.load);
  const refreshStore = useRoadLiabilitiesStore((state) => state.refresh);
  const setQuery = useRoadLiabilitiesStore((state) => state.setQuery);
  const selectLiabilityStore = useRoadLiabilitiesStore((state) => state.selectLiability);
  const selectLocalDetail = useRoadLiabilitiesStore((state) => state.selectLocalDetail);
  const closeDetail = useRoadLiabilitiesStore((state) => state.closeDetail);
  const clearSelection = useRoadLiabilitiesStore((state) => state.clearSelection);

  const overlay = useDemoSimulationStore((state) => state.roadLiabilitiesOverlay);
  const simulationEnabledActive = useDemoSimulationStore((state) => state.active);

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  useEffect(() => {
    if (overlay) return;
    if (selectedLiabilityId && isSimulatedRoadLiabilityId(selectedLiabilityId)) {
      clearSelection();
    }
  }, [overlay, selectedLiabilityId, clearSelection]);

  const displaySummary = overlay ? overlay.summary : summary;
  const filteredOverlayItems = useMemo(() => {
    if (!overlay) return null;
    return filterSimulatedLiabilities(overlay.items, query);
  }, [overlay, query]);

  const overlayPage = useMemo(() => {
    if (!filteredOverlayItems) return null;
    return paginateItems(filteredOverlayItems, query.page, query.pageSize);
  }, [filteredOverlayItems, query.page, query.pageSize]);

  const displayItems = overlayPage ? overlayPage.data : items;
  const displayPagination = useMemo<RoadLiabilityPageMeta | null>(() => {
    if (!overlayPage) return pagination;
    return {
      page: overlayPage.page,
      pageSize: overlayPage.pageSize,
      total: overlayPage.total,
      totalPages: overlayPage.totalPages,
    };
  }, [overlayPage, pagination]);

  const displayDetail = useMemo(() => {
    if (selectedLiabilityId && overlay?.details[selectedLiabilityId]) {
      return overlay.details[selectedLiabilityId];
    }
    if (selectedLiabilityId && isSimulatedRoadLiabilityId(selectedLiabilityId)) {
      return null;
    }
    return selectedDetail;
  }, [overlay, selectedLiabilityId, selectedDetail]);

  return useMemo(
    () => ({
      summary: displaySummary,
      items: displayItems,
      pagination: displayPagination,
      query,
      searchDraft,
      appliedSearch,
      activeFilterCount: countRoadLiabilityAdvancedFilters(query),
      selectedLiabilityId,
      selectedDetail: displayDetail,
      detailOpen,
      isAllowed,
      isSummaryLoading:
        !overlay &&
        (summaryStatus === "loading" || (isAllowed && summaryStatus === "idle")),
      isListLoading:
        !overlay && (listStatus === "loading" || (isAllowed && listStatus === "idle")),
      isDetailLoading:
        !overlay &&
        (detailStatus === "loading" ||
          (selectedLiabilityId != null &&
            detailOpen &&
            detailStatus === "idle" &&
            !isSimulatedRoadLiabilityId(selectedLiabilityId))),
      isRefreshing:
        !overlay && (summaryStatus === "loading" || listStatus === "loading"),
      summaryError: !overlay && summaryStatus === "error" ? summaryError : null,
      listError: !overlay && listStatus === "error" ? listError : null,
      detailError:
        overlay || (selectedLiabilityId && isSimulatedRoadLiabilityId(selectedLiabilityId))
          ? null
          : detailStatus === "error"
            ? detailError
            : null,
      simulationActive: Boolean(overlay) && simulationEnabledActive,
      load,
      refresh: refreshStore,
      applySearch: (search: string) => {
        void setQuery({ search: search.trim(), page: 1 });
      },
      clearSearch: () => {
        void setQuery({ search: "", page: 1 });
      },
      setQueue: (queue: RoadLiabilityQueueFilter) => {
        void setQuery({ queue, page: 1 });
      },
      setChannelFilter: (channel: RoadLiabilityChannelFilter) => {
        void setQuery({ channel, page: 1 });
      },
      setTypeFilter: (type: RoadLiabilityTypeFilter) => {
        void setQuery({ type, page: 1 });
      },
      setSourceFilter: (sourceKey: RoadLiabilitySourceFilter) => {
        void setQuery({ sourceKey, page: 1 });
      },
      setConfirmationFilter: (confirmationStatus: RoadLiabilityConfirmationFilter) => {
        void setQuery({ confirmationStatus, page: 1 });
      },
      setAttributionFilter: (attributionStatus: RoadLiabilityAttributionFilter) => {
        void setQuery({ attributionStatus, page: 1 });
      },
      setCollectionFilter: (collectionStatus: RoadLiabilityCollectionFilter) => {
        void setQuery({ collectionStatus, page: 1 });
      },
      setDateRange: (from: string, to: string) => {
        void setQuery({ from, to, page: 1 });
      },
      setPage: (page: number) => {
        void setQuery({ page });
      },
      clearFilters: () => {
        void setQuery({
          type: "all",
          sourceKey: "all",
          confirmationStatus: "all",
          attributionStatus: "all",
          collectionStatus: "all",
          page: 1,
        });
      },
      selectLiability: (id: string) => {
        if (overlay?.details[id]) {
          selectLocalDetail(id, overlay.details[id]);
          return;
        }
        selectLiabilityStore(id);
      },
      closeDetail,
      clearSelection,
    }),
    [
      displaySummary,
      displayItems,
      displayPagination,
      query,
      searchDraft,
      appliedSearch,
      selectedLiabilityId,
      displayDetail,
      detailOpen,
      isAllowed,
      overlay,
      summaryStatus,
      listStatus,
      detailStatus,
      summaryError,
      listError,
      detailError,
      simulationEnabledActive,
      load,
      refreshStore,
      setQuery,
      selectLiabilityStore,
      selectLocalDetail,
      closeDetail,
      clearSelection,
    ],
  );
}
