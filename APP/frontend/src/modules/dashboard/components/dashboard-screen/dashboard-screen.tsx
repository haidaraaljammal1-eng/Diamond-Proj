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
import { ExpenseBreakdownCard } from "../expense-breakdown-card/expense-breakdown-card";
import { FleetStatusCard } from "../fleet-status-card/fleet-status-card";
import { QuickAccessCard } from "../quick-access-card/quick-access-card";
import { RecentContractsCard } from "../recent-contracts-card/recent-contracts-card";
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
    quickAccess,
    refresh,
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
      ...(realOverview?.recentContracts ?? []),
      ...(realOverview?.todayDeliveries ?? []),
    ];
    registerNotificationTargets(
      records
        .filter((record) => !isDashboardSimulationId(record.id))
        .map((record) => ({
          entityType: "contract" as const,
          entityId: record.id,
          route: "/contracts" as const,
          label: record.contractNumber,
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
  const showKpis =
    kpis.activeRentals != null ||
    kpis.fleetTotal != null ||
    kpis.pendingLinks != null ||
    kpis.deliveriesToday != null;

  return (
    <>
      {header}

      {showKpis ? (
        <div className={styles.kpis}>
          {kpis.activeRentals != null ? (
            <StatCard
              label={t("kpi.activeRentals")}
              value={kpis.activeRentals}
              note={t("kpi.activeRentalsNote")}
            />
          ) : null}
          {kpis.fleetTotal != null && kpis.fleetRented != null ? (
            <StatCard
              label={t("kpi.fleet")}
              value={kpis.fleetRented}
              suffix={`/${kpis.fleetTotal}`}
              note={t("kpi.fleetNote")}
            />
          ) : null}
          {kpis.pendingLinks != null ? (
            <StatCard
              label={t("kpi.pendingLinks")}
              value={kpis.pendingLinks}
              note={t("kpi.pendingLinksNote")}
            />
          ) : null}
          {kpis.deliveriesToday != null ? (
            <StatCard
              label={t("kpi.deliveriesToday")}
              value={kpis.deliveriesToday}
              note={t("kpi.deliveriesTodayNote", {
                count: kpis.readyForDelivery ?? 0,
              })}
            />
          ) : null}
        </div>
      ) : null}

      {overview.recentContracts != null || quickAccess.length > 0 ? (
        <div className={styles.grid}>
          <RecentContractsCard
            contracts={overview.recentContracts}
            onOpenContract={openContract}
            onGenerateLink={canGenerateLink ? goVehicles : undefined}
          />
          <QuickAccessCard
            items={quickAccess}
            locale={locale}
            contractsTotal={kpis.contractsTotal}
            fleetRented={kpis.fleetRented}
            vehiclesInService={kpis.fleetService}
            gpsOnline={overview.gpsOnline}
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

      {!hasAnyDashboardSection(overview) && quickAccess.length === 0 ? (
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
