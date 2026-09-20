"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import { useDemoSimulationStore } from "@/modules/demo-simulation/simulation.store";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { GPS_PAGE_PERMISSIONS } from "../gps.permissions";
import { useGpsStore } from "../stores/gps.store";
import type {
  GpsListQuery,
  GpsMapPointDto,
  GpsOperationalFilter,
  GpsPageMeta,
  GpsSummaryDto,
  GpsTrackingFilter,
  GpsVehicleDetailDto,
  GpsVehicleListItemDto,
} from "../types/gps.types";
import { countGpsActiveFilters } from "../utils/gps-query";
import {
  applyGpsOverlayToDetail,
  applyGpsOverlayToSummary,
  applyGpsOverlayToVehicle,
  resolveDisplayMapPoints,
} from "../utils/gps-simulation";

export interface UseGpsResult {
  summary: GpsSummaryDto | null;
  vehicles: GpsVehicleListItemDto[];
  meta: GpsPageMeta | null;
  mapPoints: GpsMapPointDto[];
  query: GpsListQuery;
  activeFilterCount: number;
  selectedVehicleId: number | null;
  selectedVehicleDetail: GpsVehicleDetailDto | null;
  detailOpen: boolean;
  mapFocusToken: number;
  isAllowed: boolean;
  isSummaryLoading: boolean;
  isListLoading: boolean;
  isMapLoading: boolean;
  isDetailLoading: boolean;
  isRefreshing: boolean;
  summaryError: ApiRequestError | null;
  listError: ApiRequestError | null;
  mapError: ApiRequestError | null;
  detailError: ApiRequestError | null;
  simulationActive: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  applySearch: (search: string) => void;
  clearSearch: () => void;
  setTrackingFilter: (status: GpsTrackingFilter) => void;
  setOperationalFilter: (status: GpsOperationalFilter) => void;
  setCompanyFilter: (companyId: number | null) => void;
  setPage: (page: number) => void;
  clearFilters: () => void;
  selectVehicle: (vehicleId: number, options?: { openDetail?: boolean }) => void;
  clearSelection: () => void;
  closeDetail: () => void;
}

export function useGps(): UseGpsResult {
  const { hasPermission } = usePermissions();
  const isAllowed = GPS_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );

  const summary = useGpsStore((state) => state.summary);
  const summaryStatus = useGpsStore((state) => state.summaryStatus);
  const summaryError = useGpsStore((state) => state.summaryError);
  const vehicles = useGpsStore((state) => state.vehicles);
  const meta = useGpsStore((state) => state.meta);
  const query = useGpsStore((state) => state.query);
  const listStatus = useGpsStore((state) => state.listStatus);
  const listError = useGpsStore((state) => state.listError);
  const mapPoints = useGpsStore((state) => state.mapPoints);
  const mapStatus = useGpsStore((state) => state.mapStatus);
  const mapError = useGpsStore((state) => state.mapError);
  const selectedVehicleId = useGpsStore((state) => state.selectedVehicleId);
  const selectedVehicleDetail = useGpsStore((state) => state.selectedVehicleDetail);
  const detailStatus = useGpsStore((state) => state.detailStatus);
  const detailError = useGpsStore((state) => state.detailError);
  const detailOpen = useGpsStore((state) => state.detailOpen);
  const mapFocusToken = useGpsStore((state) => state.mapFocusToken);
  const load = useGpsStore((state) => state.load);
  const refresh = useGpsStore((state) => state.refresh);
  const setQuery = useGpsStore((state) => state.setQuery);
  const resetFilters = useGpsStore((state) => state.resetFilters);
  const selectVehicle = useGpsStore((state) => state.selectVehicle);
  const clearSelection = useGpsStore((state) => state.clearSelection);
  const closeDetail = useGpsStore((state) => state.closeDetail);

  const gpsOverlay = useDemoSimulationStore((state) => state.gpsOverlay);
  const simulationEnabledActive = useDemoSimulationStore((state) => state.active);

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const displayVehicles = useMemo(
    () => vehicles.map((item) => applyGpsOverlayToVehicle(item, gpsOverlay)),
    [vehicles, gpsOverlay],
  );
  const displayMapPoints = useMemo(
    () => resolveDisplayMapPoints(mapPoints, vehicles, gpsOverlay),
    [mapPoints, vehicles, gpsOverlay],
  );
  const displaySummary = useMemo(
    () => applyGpsOverlayToSummary(summary, gpsOverlay),
    [summary, gpsOverlay],
  );
  const displayDetail = useMemo(
    () => applyGpsOverlayToDetail(selectedVehicleDetail, gpsOverlay),
    [selectedVehicleDetail, gpsOverlay],
  );

  return useMemo(
    () => ({
      summary: displaySummary,
      vehicles: displayVehicles,
      meta,
      mapPoints: displayMapPoints,
      query,
      activeFilterCount: countGpsActiveFilters(query),
      selectedVehicleId,
      selectedVehicleDetail: displayDetail,
      detailOpen,
      mapFocusToken,
      isAllowed,
      isSummaryLoading:
        summaryStatus === "loading" || (isAllowed && summaryStatus === "idle"),
      isListLoading:
        listStatus === "loading" || (isAllowed && listStatus === "idle"),
      isMapLoading:
        mapStatus === "loading" || (isAllowed && mapStatus === "idle"),
      isDetailLoading:
        detailStatus === "loading" ||
        (selectedVehicleId != null && detailOpen && detailStatus === "idle"),
      isRefreshing:
        summaryStatus === "loading" ||
        listStatus === "loading" ||
        mapStatus === "loading",
      summaryError: summaryStatus === "error" ? summaryError : null,
      listError: listStatus === "error" ? listError : null,
      mapError: mapStatus === "error" ? mapError : null,
      detailError: detailStatus === "error" ? detailError : null,
      simulationActive: Boolean(gpsOverlay) && simulationEnabledActive,
      load,
      refresh,
      applySearch: (search: string) => {
        void setQuery({ search: search.trim(), page: 1 });
      },
      clearSearch: () => {
        void setQuery({ search: "", page: 1 });
      },
      setTrackingFilter: (trackingStatus: GpsTrackingFilter) => {
        void setQuery({ trackingStatus, page: 1 });
      },
      setOperationalFilter: (status: GpsOperationalFilter) => {
        void setQuery({ status, page: 1 });
      },
      setCompanyFilter: (companyId: number | null) => {
        void setQuery({ companyId, page: 1 });
      },
      setPage: (page: number) => {
        void setQuery({ page });
      },
      clearFilters: resetFilters,
      selectVehicle,
      clearSelection,
      closeDetail,
    }),
    [
      displaySummary,
      displayVehicles,
      meta,
      displayMapPoints,
      query,
      selectedVehicleId,
      displayDetail,
      detailOpen,
      mapFocusToken,
      isAllowed,
      summaryStatus,
      listStatus,
      mapStatus,
      detailStatus,
      summaryError,
      listError,
      mapError,
      detailError,
      gpsOverlay,
      simulationEnabledActive,
      load,
      refresh,
      setQuery,
      resetFilters,
      selectVehicle,
      clearSelection,
      closeDetail,
    ],
  );
}
