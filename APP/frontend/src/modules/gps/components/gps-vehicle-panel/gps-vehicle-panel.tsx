"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type {
  GpsListQuery,
  GpsOperationalFilter,
  GpsPageMeta,
  GpsTrackingFilter,
  GpsVehicleListItemDto,
} from "../../types/gps.types";
import {
  GPS_OPERATIONAL_FILTERS,
  GPS_TRACKING_FILTERS,
} from "../../types/gps.types";
import { GpsVehicleRow } from "../gps-vehicle-row/gps-vehicle-row";
import styles from "./gps-vehicle-panel.module.css";

export interface GpsVehiclePanelProps {
  vehicles: GpsVehicleListItemDto[];
  meta: GpsPageMeta | null;
  query: GpsListQuery;
  selectedVehicleId: number | null;
  loading: boolean;
  error: string | null;
  resultsLabel: string;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  onTrackingFilter: (value: GpsTrackingFilter) => void;
  onOperationalFilter: (value: GpsOperationalFilter) => void;
  onPage: (page: number) => void;
  now: Date;
  onSelect: (vehicleId: number) => void;
  onRetry: () => void;
}

export function GpsVehiclePanel({
  vehicles,
  meta,
  query,
  selectedVehicleId,
  loading,
  error,
  resultsLabel,
  onSearch,
  onClearSearch,
  onTrackingFilter,
  onOperationalFilter,
  onPage,
  now,
  onSelect,
  onRetry,
}: GpsVehiclePanelProps) {
  const t = useTranslations("Gps");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedVehicleId == null) return;
    const node = listRef.current?.querySelector(
      `[data-vehicle-id="${selectedVehicleId}"]`,
    );
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [selectedVehicleId]);

  const trackingOptions: SelectOption<GpsTrackingFilter>[] =
    GPS_TRACKING_FILTERS.map((value) => ({
      value,
      label: value === "all" ? t("filters.all") : t(`status.${value}`),
    }));

  const operationalOptions: SelectOption<GpsOperationalFilter>[] =
    GPS_OPERATIONAL_FILTERS.map((value) => ({
      value,
      label: value === "all" ? t("filters.all") : t(`operational.${value}`),
    }));

  const page = meta?.page ?? query.page;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <aside className={styles.panel} data-testid="gps-vehicle-panel">
      <div className={styles.toolbar}>
        <p className={styles.title}>{t("panel.title")}</p>
        <p className={styles.count}>{resultsLabel}</p>
        <DataSearch
          appliedValue={query.search}
          onSearch={onSearch}
          onClear={onClearSearch}
          placeholder={t("search.placeholder")}
          inputLabel={t("search.inputLabel")}
          searchButtonLabel={t("search.button")}
          clearButtonLabel={t("search.clear")}
          loading={loading}
          inputTestId="gps-search"
          className={styles.search}
        />
        <div className={styles.filters}>
          <Select
            size="sm"
            variant="ghost"
            value={query.trackingStatus}
            options={trackingOptions}
            onChange={onTrackingFilter}
            aria-label={t("filters.tracking")}
          />
          <Select
            size="sm"
            variant="ghost"
            value={query.status}
            options={operationalOptions}
            onChange={onOperationalFilter}
            aria-label={t("filters.operational")}
          />
        </div>
      </div>

      <div className={styles.list} ref={listRef} data-testid="gps-vehicle-list">
        {loading && vehicles.length === 0 ? (
          <>
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </>
        ) : null}
        {error ? (
          <div className={styles.empty} role="status">
            <p>{error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : null}
        {!error && !loading && vehicles.length === 0 ? (
          <p className={styles.empty}>{t("panel.empty")}</p>
        ) : null}
        {vehicles.map((item) => (
          <GpsVehicleRow
            key={item.vehicle.id}
            item={item}
            selected={item.vehicle.id === selectedVehicleId}
            now={now}
            onSelect={onSelect}
          />
        ))}
      </div>

      {meta && meta.totalPages > 1 ? (
        <nav
          className={styles.pagination}
          aria-label={t("pagination.label")}
          data-testid="gps-pagination"
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => onPage(page - 1)}
          >
            {t("pagination.previous")}
          </Button>
          <span className={styles.page}>
            {t("pagination.page", { page, totalPages })}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => onPage(page + 1)}
          >
            {t("pagination.next")}
          </Button>
        </nav>
      ) : null}
    </aside>
  );
}
