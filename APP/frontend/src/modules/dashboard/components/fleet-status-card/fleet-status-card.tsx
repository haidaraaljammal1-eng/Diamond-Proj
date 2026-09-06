"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { Chip } from "@/shared/components/ui/chip";
import { ListRow } from "@/shared/components/ui/list-row";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import type { FleetBreakdown } from "../../types/dashboard.types";
import styles from "./fleet-status-card.module.css";

export interface FleetStatusCardProps {
  fleet: FleetBreakdown;
  fleetTotal: number;
}

/** Fleet split by vehicle status, with the office utilization rate. */
export function FleetStatusCard({ fleet, fleetTotal }: FleetStatusCardProps) {
  const t = useTranslations("Dashboard");
  const CarsIcon = NAVIGATION_ICONS.cars;
  const MaintenanceIcon = NAVIGATION_ICONS.maintenance;

  const utilization =
    fleetTotal > 0 ? Math.round((fleet.rented / fleetTotal) * 100) : 0;

  const rows = [
    {
      key: "rented" as const,
      icon: <CarsIcon />,
      count: fleet.rented,
      tone: "ok" as const,
    },
    {
      key: "available" as const,
      icon: <CarsIcon />,
      count: fleet.available,
      tone: "gold" as const,
    },
    {
      key: "service" as const,
      icon: <MaintenanceIcon />,
      count: fleet.service,
      tone: "warn" as const,
    },
  ];

  return (
    <Card as="section" className={styles.card}>
      <Card.Title
        icon={<CarsIcon />}
        trailing={
          <Chip tone="gold" dot>
            {t("fleet.utilization", { percent: utilization })}
          </Chip>
        }
      >
        {t("fleet.title")}
      </Card.Title>

      <div className={styles.list}>
        {rows.map((row) => (
          <ListRow
            key={row.key}
            icon={row.icon}
            title={t(`fleet.${row.key}`)}
            meta={t(`fleet.${row.key}Note`)}
            trailing={
              <Chip tone={row.tone} dot>
                {t("fleet.count", { count: row.count })}
              </Chip>
            }
          />
        ))}
      </div>
    </Card>
  );
}
