"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatCard } from "@/shared/components/ui/stat-card";
import { ContractDetailDrawer } from "@/modules/contracts/components/contract-detail/contract-detail-drawer";
import { GENERATE_RENTAL_LINK_HREF } from "../../utils/dashboard.routes";
import { hasAnyDashboardSection } from "../../utils/dashboard.selectors";
import { useDashboardOverview } from "../../hooks/use-dashboard-overview";
import {
  DashboardSimulationControls,
  isDashboardSimulationId,
  selectDashboardPresentation,
  useDashboardSimulation,
} from "../../simulation";
import { DashboardCompanyScope } from "../dashboard-company-scope/dashboard-company-scope";
import { ExpenseBreakdownCard } from "../expense-breakdown-card/expense-breakdown-card";
import { FleetStatusCard } from "../fleet-status-card/fleet-status-card";
import { DashboardReservedSlot } from "../dashboard-reserved-slot/dashboard-reserved-slot";
import { TodayContractsCard } from "../today-contracts-card/today-contracts-card";
import { TodayDeliveriesCard } from "../today-deliveries-card/today-deliveries-card";
import { WeeklyMovementCard } from "../weekly-movement-card/weekly-movement-card";
import { useNotificationRecordTargets } from "@/modules/notifications/simulation/use-notification-record-targets";
import styles from "./dashboard-screen.module.css";

export function DashboardScreen() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const router = useRouter();
  const {
    overview: realOverview,
    isAllowed,
    isAuthLoading,
    error,
    viewerName,
    canReadContracts,
    canReadVehicles,
    canGenerateLink,
    refresh,
    companyId,
    setCompanyId,
  } = useDashboardOverview();
  const simulation = useDashboardSimulation();
  const registerNotificationTargets = useNotificationRecordTargets();
  const overview = selectDashboardPresentation(
    realOverview,
    simulation.active,
    simulation.overview,
  );
  const [drawerId, setDrawerId] = useState<string | null>(null);

  useEffect(() => {
    const records = [
      ...(realOverview?.todayContracts ?? []),
      ...(realOverview?.todayDeliveries ?? []),
    ];
    registerNotificationTargets(
      records
        .filter((record) => !isDashboardSimulationId(record.id))
        .map((record) => ({
          entityType: "contract" as const,
          entityId: record.id,
          route: "/contracts" as const,
          label: record.vehicleName,
          reference: record.vehicleName,
        })),
    );
  }, [realOverview, registerNotificationTargets]);

  const isOfficeView = canReadContracts && canReadVehicles;
  const greeting = viewerName
    ? t(isOfficeView ? "greetingOwner" : "greetingEmployee", { name: viewerName })
    : t("greetingFallback");

  const goVehicles = useCallback(() => {
    router.push(`/${locale}${GENERATE_RENTAL_LINK_HREF}`);
  }, [locale, router]);

  const goContracts = useCallback(() => {
    setDrawerId(null);
    router.push(`/${locale}/contracts`);
  }, [locale, router, setDrawerId]);

  const openContract = useCallback((id: string) => {
    if (isDashboardSimulationId(id)) return;
    setDrawerId(id);
  }, [setDrawerId]);

  const header = (
    <PageHeader
      crumbs={isOfficeView ? t("crumbsOwner") : t("crumbsEmployee")}
      title={greeting}
      subtitle={isOfficeView ? t("subtitleOwner") : t("subtitleEmployee")}
      actions={
        <>
          {isAllowed ? (
            <DashboardCompanyScope companyId={companyId} onChange={setCompanyId} />
          ) : null}
          <DashboardSimulationControls />
          {canGenerateLink ? (
            <Button type="button" size="md" onClick={goVehicles}>
              {t("generateNewLink")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (isAuthLoading) {
    return (
      <>
        {header}
        <section className={styles.panel} role="status">
          <p className={styles.panelText}>{t("loading")}</p>
        </section>
      </>
    );
  }

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

  if (error && !overview) {
    return (
      <>
        {header}
        <section className={styles.panel} role="alert">
          <p className={styles.panelTitle}>{t("error.title")}</p>
          <p className={styles.panelText}>{t("error.description")}</p>
          <Button type="button" size="sm" onClick={() => void refresh()}>
            {t("error.retry")}
          </Button>
        </section>
      </>
    );
  }

  if (!overview) {
    return (
      <>
        {header}
        <section className={styles.panel} role="status">
          <p className={styles.panelText}>{t("loading")}</p>
        </section>
      </>
    );
  }

  const kpis = overview.kpis;
  const showTopKpis =
    kpis.fleetRented != null ||
    kpis.fleetAvailable != null ||
    kpis.rentedToday != null;

  return (
    <>
      {header}

      {showTopKpis ? (
        <div className={styles.kpis}>
          {kpis.fleetRented != null ? (
            <StatCard label={t("kpi.rentedCars")} value={kpis.fleetRented} />
          ) : null}
          {kpis.fleetAvailable != null ? (
            <StatCard label={t("kpi.availableCars")} value={kpis.fleetAvailable} />
          ) : null}
          {kpis.rentedToday != null ? (
            <StatCard label={t("kpi.rentedToday")} value={kpis.rentedToday} />
          ) : null}
        </div>
      ) : null}

      {overview.todayContracts != null ? (
        <div className={styles.grid}>
          <DashboardReservedSlot />
          <TodayContractsCard
            contracts={overview.todayContracts}
            onOpenContract={openContract}
          />
        </div>
      ) : null}

      {overview.weeklyRentalActivity != null || overview.weeklyFinance != null ? (
        <div className={styles.grid}>
          <WeeklyMovementCard series={overview.weeklyRentalActivity} />
          <ExpenseBreakdownCard finance={overview.weeklyFinance} />
        </div>
      ) : null}

      {overview.todayDeliveries != null || overview.fleetStatus != null ? (
        <div className={[styles.grid, styles.gridWide].join(" ")}>
          <TodayDeliveriesCard
            deliveries={overview.todayDeliveries}
            readyCount={kpis.readyForDelivery}
            onOpenContract={openContract}
          />
          <FleetStatusCard fleet={overview.fleetStatus} />
        </div>
      ) : null}

      {!hasAnyDashboardSection(overview) ? (
        <section className={styles.panel} role="status">
          <p className={styles.panelTitle}>{t("restricted.title")}</p>
          <p className={styles.panelText}>{t("restricted.description")}</p>
        </section>
      ) : null}

      <ContractDetailDrawer
        contractId={drawerId}
        onClose={() => setDrawerId(null)}
        onGenerateRentalLink={goContracts}
        onCarOut={goContracts}
        onCarIn={goContracts}
        onReturnLink={goContracts}
        onRenew={goContracts}
        onReconcile={goContracts}
        onCloseContract={goContracts}
      />
    </>
  );
}
