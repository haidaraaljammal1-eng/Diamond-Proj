"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ActionTile } from "@/shared/components/ui/action-tile";
import { Card } from "@/shared/components/ui/card";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { QuickAccessIcon } from "../../dashboard.icons";
import type { DashboardQuickAccessItem } from "../../types/dashboard.types";
import styles from "./quick-access-card.module.css";

export interface QuickAccessCardProps {
  items: readonly DashboardQuickAccessItem[];
  locale: string;
  contractsTotal: number | null;
  fleetRented: number | null;
  vehiclesInService: number | null;
  gpsOnline: number | null;
}

export function QuickAccessCard({
  items,
  locale,
  contractsTotal,
  fleetRented,
  vehiclesInService,
  gpsOnline,
}: QuickAccessCardProps) {
  const t = useTranslations("Dashboard");
  const nav = useTranslations("navigation");
  const router = useRouter();

  const CarsIcon = NAVIGATION_ICONS.cars;
  const ContractsIcon = NAVIGATION_ICONS.contracts;
  const GpsIcon = NAVIGATION_ICONS.gps;
  const MaintenanceIcon = NAVIGATION_ICONS.maintenance;

  if (items.length === 0) return null;

  const metaFor = (key: DashboardQuickAccessItem["key"]): string => {
    if (key === "cars") return t("quick.carsMeta");
    if (key === "contracts") {
      return contractsTotal == null
        ? t("quick.contractsView")
        : t("quick.contractsMeta", { count: contractsTotal });
    }
    if (key === "gps") {
      const count = gpsOnline ?? fleetRented;
      return count == null ? t("quick.gpsView") : t("quick.gpsMeta", { count });
    }
    return vehiclesInService == null
      ? t("quick.maintenanceView")
      : t("quick.maintenanceMeta", { count: vehiclesInService });
  };

  const iconFor = (key: DashboardQuickAccessItem["key"]) => {
    if (key === "cars") return <CarsIcon />;
    if (key === "contracts") return <ContractsIcon />;
    if (key === "gps") return <GpsIcon />;
    return <MaintenanceIcon />;
  };

  return (
    <Card as="section" className={styles.card}>
      <Card.Title icon={<QuickAccessIcon />}>{t("quickAccess")}</Card.Title>

      <div className={styles.grid}>
        {items.map((item) => (
          <ActionTile
            key={item.key}
            icon={iconFor(item.key)}
            title={nav(item.key)}
            meta={metaFor(item.key)}
            onClick={() => router.push(`/${locale}${item.href}`)}
          />
        ))}
      </div>
    </Card>
  );
}
