"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { useFleetTypeLookup } from "../../hooks/use-fleet-type-lookup";
import { useVehicles } from "../../hooks/use-vehicles";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { VehicleDetailDialog } from "../vehicle-detail/vehicle-detail-dialog";
import { VehicleFilters } from "../vehicle-filters/vehicle-filters";
import { VehiclesGrid } from "../vehicles-grid/vehicles-grid";
import { SetRentalPriceDialog } from "../../forms/rental-price/set-rental-price-dialog";
import { AddVehicleDialog } from "../../forms/add-vehicle/add-vehicle-dialog";
import { EditDefaultRateDialog } from "../../forms/edit-rates/edit-default-rate-dialog";
import { VehicleDeactivateDialog } from "../../forms/deactivate/vehicle-deactivate-dialog";
import { useContract } from "@/modules/contracts/hooks/use-contract";
import { resolveFleetPrimaryIntent } from "../../utils/resolve-fleet-contract-intent";
import {
  isFleetNextDisabled,
  isFleetPreviousDisabled,
  shouldShowFleetPagination,
} from "../../utils/vehicles-pagination";
import { CarOutDialog } from "@/modules/contracts/forms/car-out/car-out-dialog";
import { CarInDialog } from "@/modules/contracts/forms/car-in/car-in-dialog";
import { RenewDialog } from "@/modules/contracts/forms/renew/renew-dialog";
import { ContractLinkResultDialog } from "@/modules/contracts/components/contract-link-result/contract-link-result-dialog";
import { ContractDetailDrawer } from "@/modules/contracts/components/contract-detail/contract-detail-drawer";
import { ReconcileDialog } from "@/modules/contracts/forms/reconcile/reconcile-dialog";
import { CloseContractDialog } from "@/modules/contracts/forms/close/close-contract-dialog";
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
    canManage,
    canCreate,
    setStatusFilter,
    applySearch,
    clearSearch,
    setVehicleType,
    setSort,
    clearFilters,
    setPage,
  } = useVehicles();
  const { types, isLoading: typesLoading } = useFleetTypeLookup();
  const { generateReturnLink, generateRentalLink } = useContract();

  const [detailVehicle, setDetailVehicle] = useState<VehicleCardDto | null>(null);
  const [priceVehicle, setPriceVehicle] = useState<VehicleCardDto | null>(null);
  const [editRatesVehicle, setEditRatesVehicle] = useState<VehicleCardDto | null>(null);
  const [deactivateVehicle, setDeactivateVehicle] = useState<VehicleCardDto | null>(null);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [carOutId, setCarOutId] = useState<string | null>(null);
  const [carInId, setCarInId] = useState<string | null>(null);
  const [contractDrawerId, setContractDrawerId] = useState<string | null>(null);
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [renewId, setRenewId] = useState<string | null>(null);

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
      searchInputLabel: t("search.inputLabel"),
      searchPlaceholder: t("search.placeholder"),
      searchButton: t("search.button"),
      searchClear: t("search.clear"),
      typeLabel: t("filters.typeLabel"),
      typeAll: t("filters.typeAll"),
      typesLoading: t("filters.typesLoading"),
      sortLabel: t("filters.sortLabel"),
      clear: t("filters.clear"),
      activeCount: t("filters.activeCount", { count: activeFilterCount }),
    }),
    [t, activeFilterCount],
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const handlePrimaryAction = useCallback(
    (vehicle: VehicleCardDto) => {
      const intent = resolveFleetPrimaryIntent(vehicle);
      switch (intent.type) {
        case "car-out":
          setCarOutId(intent.contractId);
          return;
        case "maintenance":
          router.push(`/${locale}/maintenance`);
          return;
        case "generate-return-link":
          void generateReturnLink(intent.contractId);
          return;
        case "open-contract":
          setContractDrawerId(intent.contractId);
          return;
        case "reconcile":
          setReconcileId(intent.contractId);
          return;
        case "no-contract":
          showNotice(t("boundary.noContract"));
          return;
        case "set-rental-price":
          setPriceVehicle(vehicle);
          return;
      }
    },
    [locale, router, showNotice, t, generateReturnLink],
  );

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        isReady ? (
          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => void refreshVehicles()}
              disabled={isLoading}
            >
              {t("refresh")}
            </Button>
            {canCreate ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setAddVehicleOpen(true)}
              >
                {t("addVehicle")}
              </Button>
            ) : null}
          </div>
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

  if (!isReady && vehicles.length === 0) {
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

  const showEmptyFleet = isReady && (meta?.total ?? 0) === 0;
  const showPagination = meta != null && shouldShowFleetPagination(meta);

  return (
    <>
      {header}

      {notice ? (
        <div className={styles.notice} role="status">{notice}</div>
      ) : null}

      <VehicleFilters
        filters={filters}
        activeFilterCount={activeFilterCount}
        types={types}
        typesLoading={typesLoading}
        searchLoading={isLoading}
        resultsLabel={t("filters.results", { count: meta?.total ?? 0 })}
        labels={filterLabels}
        onStatusChange={setStatusFilter}
        onSearchSubmit={applySearch}
        onSearchClear={clearSearch}
        onTypeChange={setVehicleType}
        onSortChange={setSort}
        onClear={clearFilters}
      />

      {showEmptyFleet ? (
        <EmptyState
          title={activeFilterCount === 0 ? t("empty.title") : t("empty.filteredTitle")}
          description={
            activeFilterCount === 0
              ? t("empty.description")
              : t("empty.filteredDescription")
          }
          action={
            activeFilterCount > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                {t("filters.clear")}
              </Button>
            ) : canCreate ? (
              <Button type="button" variant="primary" size="sm" onClick={() => setAddVehicleOpen(true)}>
                {t("addVehicle")}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <VehiclesGrid
            vehicles={vehicles}
            canManage={canManage}
            onOpen={setDetailVehicle}
            onPrimaryAction={handlePrimaryAction}
            onEditRates={setEditRatesVehicle}
            onDelete={setDeactivateVehicle}
            onGps={(vehicle) => router.push(`/${locale}/gps?vehicleId=${vehicle.id}`)}
          />

          {showPagination ? (
            <nav
              className={styles.pagination}
              aria-label={t("pagination.label")}
              data-testid="vehicles-pagination"
            >
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={isFleetPreviousDisabled(meta, isLoading)}
                aria-label={t("pagination.previous")}
                onClick={() => setPage(meta.page - 1)}
              >
                {t("pagination.previous")}
              </Button>
              <span className={styles.paginationStatus}>
                {t("pagination.page", {
                  page: meta.page,
                  totalPages: meta.totalPages,
                })}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={isFleetNextDisabled(meta, isLoading)}
                aria-label={t("pagination.next")}
                onClick={() => setPage(meta.page + 1)}
              >
                {t("pagination.next")}
              </Button>
            </nav>
          ) : null}
        </>
      )}

      <VehicleDetailDialog
        vehicle={detailVehicle}
        canManage={canManage}
        onClose={() => setDetailVehicle(null)}
        onSetPrice={setPriceVehicle}
        onPrimaryAction={handlePrimaryAction}
        onGps={(vehicle) => router.push(`/${locale}/gps?vehicleId=${vehicle.id}`)}
        onMaintenance={() => router.push(`/${locale}/maintenance`)}
        onPhotoNotice={showNotice}
      />

      <SetRentalPriceDialog
        vehicle={priceVehicle}
        onClose={() => setPriceVehicle(null)}
      />

      <CarOutDialog contractId={carOutId} onClose={() => setCarOutId(null)} />
      <CarInDialog contractId={carInId} onClose={() => setCarInId(null)} />
      <RenewDialog contractId={renewId} onClose={() => setRenewId(null)} />
      <ContractLinkResultDialog />
      <ContractDetailDrawer
        contractId={contractDrawerId}
        onClose={() => setContractDrawerId(null)}
        onGenerateRentalLink={(id) => void generateRentalLink(id)}
        onCarOut={setCarOutId}
        onCarIn={setCarInId}
        onReturnLink={(id) => void generateReturnLink(id)}
        onRenew={setRenewId}
        onReconcile={setReconcileId}
        onCloseContract={setCloseId}
      />
      <ReconcileDialog
        contractId={reconcileId}
        onClose={() => setReconcileId(null)}
        onRequestClose={(id) => {
          setReconcileId(null);
          setCloseId(id);
        }}
      />
      <CloseContractDialog contractId={closeId} onClose={() => setCloseId(null)} />

      <EditDefaultRateDialog
        vehicle={editRatesVehicle}
        onClose={() => setEditRatesVehicle(null)}
        onSuccess={() => showNotice(t("editRates.success"))}
      />

      <VehicleDeactivateDialog
        vehicle={deactivateVehicle}
        onClose={() => setDeactivateVehicle(null)}
        onSuccess={() => showNotice(t("deactivate.success"))}
      />

      <AddVehicleDialog
        open={addVehicleOpen}
        onClose={() => setAddVehicleOpen(false)}
        onSuccess={(result) => {
          showNotice(
            result?.photoUploadFailed
              ? t("form.createPhotoUploadFailed")
              : t("form.createSuccess"),
          );
        }}
      />
    </>
  );
}
