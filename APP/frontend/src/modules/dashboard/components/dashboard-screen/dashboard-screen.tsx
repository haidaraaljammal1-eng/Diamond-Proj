"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatCard } from "@/shared/components/ui/stat-card";
import { useDashboardOverview } from "../../hooks/use-dashboard-overview";
import { ExpenseBreakdownCard } from "../expense-breakdown-card/expense-breakdown-card";
import { FleetStatusCard } from "../fleet-status-card/fleet-status-card";
import { QuickAccessCard } from "../quick-access-card/quick-access-card";
import { RecentContractsCard } from "../recent-contracts-card/recent-contracts-card";
import { TodayDeliveriesCard } from "../today-deliveries-card/today-deliveries-card";
import { WeeklyMovementCard } from "../weekly-movement-card/weekly-movement-card";
import styles from "./dashboard-screen.module.css";

/**
 * Home dashboard — the Demo `vDash()` view: three KPI tiles, the latest
 * contracts list and the Quick Access card, in the Demo owner/employee split.
 *
 * Data comes from `useDashboardOverview` (Demo fixtures today, Backend later).
 * Every shortcut targets a page that does not exist yet, so — like the shell's
 * own placeholder actions — the controls render disabled with the "coming
 * later" note instead of linking nowhere.
 */
export function DashboardScreen() {
  const t = useTranslations("Dashboard");
  const shell = useTranslations("Shell");
  const { overview, isOwner, isAllowed, viewerName } = useDashboardOverview();

  const greeting = viewerName
    ? t(isOwner ? "greetingOwner" : "greetingEmployee", { name: viewerName })
    : t("greetingFallback");

  const header = (
    <PageHeader
      crumbs={isOwner ? t("crumbsOwner") : t("crumbsEmployee")}
      title={greeting}
      subtitle={isOwner ? t("subtitleOwner") : t("subtitleEmployee")}
      actions={
        <Button
          type="button"
          size="md"
          aria-disabled="true"
          title={`${t("generateNewLink")} — ${shell("navigationActionNote")}`}
        >
          {t("generateNewLink")}
        </Button>
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

  return (
    <>
      {header}

      <div className={styles.kpis}>
        <StatCard
          label={t("kpi.activeContracts")}
          value={overview.activeContracts}
          note={t("kpi.activeContractsNote", { count: overview.ongoingRentals })}
          noteTone="up"
        />
        <StatCard
          label={t("kpi.fleet")}
          value={overview.fleetRented}
          suffix={`/${overview.fleetTotal}`}
          note={t("kpi.fleetNote")}
        />
        <StatCard
          label={t("kpi.pendingLinks")}
          value={overview.pendingLinks}
          note={t("kpi.pendingLinksNote")}
        />
        <StatCard
          label={t("kpi.deliveriesToday")}
          value={overview.deliveriesToday}
          note={t("kpi.deliveriesTodayNote", { count: overview.readyForDelivery })}
        />
      </div>

      <div className={styles.grid}>
        <RecentContractsCard
          contracts={overview.recentContracts}
          isOwner={isOwner}
        />
        <QuickAccessCard
          contractsTotal={overview.contractsTotal}
          fleetRented={overview.fleetRented}
          vehiclesInService={overview.vehiclesInService}
          unreadMessages={overview.unreadMessages}
          isOwner={isOwner}
        />
      </div>

      <div className={styles.grid}>
        <WeeklyMovementCard week={overview.week} />
        <ExpenseBreakdownCard expenses={overview.expenses} />
      </div>

      <div className={[styles.grid, styles.gridWide].join(" ")}>
        <TodayDeliveriesCard
          deliveries={overview.todayDeliveries}
          readyCount={overview.readyForDelivery}
        />
        <FleetStatusCard fleet={overview.fleet} fleetTotal={overview.fleetTotal} />
      </div>
    </>
  );
}
