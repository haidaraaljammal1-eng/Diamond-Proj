"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useNow, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SimulationButton, useDemoSimulation } from "@/modules/demo-simulation";
import { ContractDetailDrawer } from "@/modules/contracts/components/contract-detail/contract-detail-drawer";
import { useGps } from "../../hooks/use-gps";
import { useGpsSimulationMotion } from "../../hooks/use-gps-simulation-motion";
import { buildGpsSimulationOverlay } from "../../utils/gps-simulation";
import { resolveGpsErrorMessage } from "../../utils/resolve-gps-error";
import { GpsDetailDrawer } from "../gps-detail/gps-detail";
import { GpsProviderBanner } from "../gps-empty-state/gps-empty-state";
import { GpsMap } from "../gps-map/gps-map";
import { GpsSummaryStrip } from "../gps-summary/gps-summary";
import { GpsVehiclePanel } from "../gps-vehicle-panel/gps-vehicle-panel";
import { GpsVehicleRow } from "../gps-vehicle-row/gps-vehicle-row";
import styles from "./gps-screen.module.css";

export function GpsScreen() {
  const t = useTranslations("Gps");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const simulation = useDemoSimulation();
  useGpsSimulationMotion();

  const gps = useGps();
  const now = useNow({ updateInterval: 60_000 });
  const [contractId, setContractId] = useState<string | null>(null);

  const deepLinkId = Number(searchParams.get("vehicleId") ?? "");

  const selectVehicle = gps.selectVehicle;
  const isAllowed = gps.isAllowed;

  useEffect(() => {
    if (!isAllowed || !Number.isFinite(deepLinkId) || deepLinkId <= 0) return;
    selectVehicle(deepLinkId);
  }, [isAllowed, deepLinkId, selectVehicle]);

  const selectedItem = useMemo(
    () => gps.vehicles.find((item) => item.vehicle.id === gps.selectedVehicleId) ?? null,
    [gps.vehicles, gps.selectedVehicleId],
  );

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        gps.isAllowed ? (
          <div className={styles.headerActions}>
            <SimulationButton
              surface="gps"
              onGpsSimulate={() => {
                const overlay = buildGpsSimulationOverlay(
                  gps.vehicles.map((item) => item.vehicle.id),
                );
                simulation.simulateGps(overlay);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => void gps.refresh()}
              disabled={gps.isRefreshing}
            >
              {t("refresh")}
            </Button>
          </div>
        ) : null
      }
    />
  );

  if (!gps.isAllowed) {
    return (
      <>
        {header}
        <section className={styles.denied} role="status">
          <p className={styles.deniedTitle}>{t("denied.title")}</p>
          <p>{t("denied.description")}</p>
        </section>
      </>
    );
  }

  const configured = gps.summary?.providerConfigured ?? false;
  const mapEmpty = !gps.simulationActive && gps.mapPoints.length === 0 && !gps.isMapLoading;
  const goContracts = () => {
    setContractId(null);
    router.push(`/${locale}/contracts`);
  };

  return (
    <div className={styles.screen} data-testid="gps-screen">
      {header}
      <GpsProviderBanner configured={configured} />
      <GpsSummaryStrip
        summary={gps.summary}
        loading={gps.isSummaryLoading}
        error={resolveGpsErrorMessage(t, gps.summaryError)}
        onRetry={() => void gps.refresh()}
      />

      <div className={styles.ops}>
        <div className={styles.mapCol}>
          <GpsMap
            points={gps.mapPoints}
            selectedVehicleId={gps.selectedVehicleId}
            focusToken={gps.mapFocusToken}
            loading={gps.isMapLoading}
            error={resolveGpsErrorMessage(t, gps.mapError)}
            empty={mapEmpty}
            onSelect={(vehicleId) => gps.selectVehicle(vehicleId)}
            onRetry={() => void gps.refresh()}
          />
        </div>

        {selectedItem ? (
          <div className={styles.mobileSelected} data-testid="gps-selected-compact">
            <GpsVehicleRow
              item={selectedItem}
              selected
              now={now}
              onSelect={(vehicleId) => gps.selectVehicle(vehicleId)}
            />
          </div>
        ) : null}

        <GpsVehiclePanel
          vehicles={gps.vehicles}
          meta={gps.meta}
          query={gps.query}
          selectedVehicleId={gps.selectedVehicleId}
          loading={gps.isListLoading}
          error={resolveGpsErrorMessage(t, gps.listError)}
          resultsLabel={
            gps.isListLoading && gps.meta == null
              ? t("panel.loading")
              : t("panel.results", {
                  count: gps.meta?.total ?? gps.vehicles.length,
                })
          }
          onSearch={gps.applySearch}
          onClearSearch={gps.clearSearch}
          onTrackingFilter={gps.setTrackingFilter}
          onOperationalFilter={gps.setOperationalFilter}
          onPage={gps.setPage}
          now={now}
          onSelect={(vehicleId) => gps.selectVehicle(vehicleId)}
          onRetry={() => void gps.refresh()}
        />
      </div>

      <GpsDetailDrawer
        open={gps.detailOpen}
        detail={gps.selectedVehicleDetail}
        loading={gps.isDetailLoading}
        error={resolveGpsErrorMessage(t, gps.detailError)}
        onClose={gps.closeDetail}
        onRetry={() => {
          if (gps.selectedVehicleId != null) gps.selectVehicle(gps.selectedVehicleId);
        }}
        onViewContract={(id) => {
          gps.closeDetail();
          setContractId(id);
        }}
      />

      <ContractDetailDrawer
        contractId={contractId}
        onClose={() => setContractId(null)}
        onGenerateRentalLink={goContracts}
        onCarOut={goContracts}
        onCarIn={goContracts}
        onReturnLink={goContracts}
        onRenew={goContracts}
        onReconcile={goContracts}
        onCloseContract={goContracts}
      />
    </div>
  );
}
