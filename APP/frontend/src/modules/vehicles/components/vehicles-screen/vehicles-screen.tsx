"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { useModelLookup } from "../../hooks/use-model-lookup";
import { useVehicles } from "../../hooks/use-vehicles";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { VehicleDetailDialog } from "../vehicle-detail/vehicle-detail-dialog";
import { VehicleFilters } from "../vehicle-filters/vehicle-filters";
import { VehiclesGrid } from "../vehicles-grid/vehicles-grid";
import { SetRentalPriceDialog } from "../../forms/rental-price/set-rental-price-dialog";
import styles from "./vehicles-screen.module.css";

export function VehiclesScreen() {
  const t = useTranslations("Vehicles");
  const locale = useLocale();
  const router = useRouter();
  const {
    vehicles,
    meta,
    filters,
    activeFilterCount,
    isAllowed,
    isLoading,
    isReady,
    error,
    refreshVehicles,
    setStatusFilter,
    setSearch,
    setModelId,
    setIncludeInactive,
    setSort,
    clearFilters,
  } = useVehicles();
  const { models, isLoading: modelsLoading } = useModelLookup();

  const [detailVehicle, setDetailVehicle] = useState<VehicleCardDto | null>(null);
  const [priceVehicle, setPriceVehicle] = useState<VehicleCardDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filterLabels = useMemo(
    () => ({
      statusGroup: t("filters.statusGroup"),
      status: {
        all: t("filters.all"),
        available: t("filters.available"),
        rented: t("filters.rented"),
        service: t("filters.service"),
      },
      sort: {
        newest: t("filters.sort.newest"),
        priceAsc: t("filters.sort.priceAsc"),
        priceDesc: t("filters.sort.priceDesc"),
        yearDesc: t("filters.sort.yearDesc"),
        plate: t("filters.sort.plate"),
      },
      searchLabel: t("filters.searchLabel"),
      searchPlaceholder: t("filters.searchPlaceholder"),
      modelLabel: t("filters.modelLabel"),
      modelAll: t("filters.modelAll"),
      modelsLoading: t("filters.modelsLoading"),
      sortLabel: t("filters.sortLabel"),
      includeInactive: t("filters.includeInactive"),
      clear: t("filters.clear"),
      activeCount: t("filters.activeCount", { count: activeFilterCount }),
    }),
    [t, activeFilterCount],
  );

  const modelOptions = useMemo(
    () => models.map((model) => ({ id: model.id, label: model.label })),
    [models],
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const handlePrimaryAction = useCallback(
    (vehicle: VehicleCardDto) => {
      if (vehicle.operationalStatus === "service") {
        router.push(`/${locale}/maintenance`);
        return;
      }
      if (vehicle.operationalStatus === "rented") {
        showNotice(t("boundary.noContract"));
        return;
      }
      setPriceVehicle(vehicle);
    },
    [locale, router, showNotice, t],
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
            variant="ghost"
            onClick={() => void refreshVehicles()}
            disabled={isLoading}
          >
            {t("refresh")}
          </Button>
        ) : null
      }
    />
  );

  if (!isAllowed) {
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

  if (error) {
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
            <Button type="button" onClick={() => void refreshVehicles()}>
              {t("error.retry")}
            </Button>
          </div>
        </section>
      </>
    );
  }

  if (!isReady) {
    return (
      <>
        {header}
        <div
          className={styles.skeletonGrid}
          role="status"
          aria-label={t("loading")}
          data-testid="vehicles-grid-skeleton"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={styles.skeletonCard} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      {notice ? (
        <div className={styles.notice} role="status">{notice}</div>
      ) : null}

      <VehicleFilters
        filters={filters}
        activeFilterCount={activeFilterCount}
        models={modelOptions}
        modelsLoading={modelsLoading}
        resultsLabel={t("filters.results", { count: meta?.total ?? vehicles.length })}
        labels={filterLabels}
        onStatusChange={setStatusFilter}
        onSearchChange={setSearch}
        onModelChange={setModelId}
        onIncludeInactiveChange={setIncludeInactive}
        onSortChange={setSort}
        onClear={clearFilters}
      />

      {vehicles.length === 0 ? (
        <EmptyState
          title={activeFilterCount === 0 ? t("empty.title") : t("empty.filteredTitle")}
          description={
            activeFilterCount === 0
              ? t("empty.description")
              : t("empty.filteredDescription")
          }
          action={
            activeFilterCount > 0 ? (
              <Button type="button" size="sm" onClick={clearFilters}>
                {t("filters.clear")}
              </Button>
            ) : null
          }
        />
      ) : (
        <VehiclesGrid
          vehicles={vehicles}
          onOpen={setDetailVehicle}
          onSetPrice={setPriceVehicle}
          onPrimaryAction={handlePrimaryAction}
          onGps={() => showNotice(t("boundary.gpsPending"))}
          onMore={() => showNotice(t("boundary.noAlerts"))}
        />
      )}

      <VehicleDetailDialog
        vehicle={detailVehicle}
        onClose={() => setDetailVehicle(null)}
        onSetPrice={setPriceVehicle}
        onPrimaryAction={handlePrimaryAction}
        onGps={() => showNotice(t("boundary.gpsPending"))}
        onMaintenance={() => router.push(`/${locale}/maintenance`)}
      />

      <SetRentalPriceDialog
        vehicle={priceVehicle}
        onClose={() => setPriceVehicle(null)}
      />
    </>
  );
}
