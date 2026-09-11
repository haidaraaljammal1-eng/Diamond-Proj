"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { Chip } from "@/shared/components/ui/chip";
import { ListRow } from "@/shared/components/ui/list-row";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { fleetUtilizationPercent } from "../../utils/dashboard.selectors";
import type { FleetStatusDto } from "../../types/dashboard.types";
import styles from "./fleet-status-card.module.css";

export interface FleetStatusCardProps {
  fleet: FleetStatusDto | null;
}

export function FleetStatusCard({ fleet }: FleetStatusCardProps) {
  const t = useTranslations("Dashboard");
  const CarsIcon = NAVIGATION_ICONS.cars;
  const MaintenanceIcon = NAVIGATION_ICONS.maintenance;

  if (!fleet) return null;

  const utilization = fleetUtilizationPercent(fleet);

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
