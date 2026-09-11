"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { Chip } from "@/shared/components/ui/chip";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { ListRow } from "@/shared/components/ui/list-row";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { ContractStatusChip } from "@/modules/contracts/components/contract-status/contract-status";
import type { TodayDeliveryDto } from "../../types/dashboard.types";
import styles from "./today-deliveries-card.module.css";

export interface TodayDeliveriesCardProps {
  deliveries: TodayDeliveryDto[] | null;
  readyCount: number | null;
  onOpenContract: (id: string) => void;
}

export function TodayDeliveriesCard({
  deliveries,
  readyCount,
  onOpenContract,
}: TodayDeliveriesCardProps) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();
  const CarsIcon = NAVIGATION_ICONS.cars;

  if (deliveries == null) return null;

  return (
    <Card as="section">
      <Card.Title
        icon={<CarsIcon />}
        trailing={
          deliveries.length > 0 && readyCount != null ? (
            <Chip tone="gold" dot>
              {t("deliveries.ready", { count: readyCount })}
            </Chip>
          ) : null
        }
      >
        {t("deliveries.title")}
      </Card.Title>

      {deliveries.length === 0 ? (
        <EmptyState variant="inline" title={t("deliveries.empty")} />
      ) : (
        <div className={styles.list}>
          {deliveries.map((delivery) => {
            const customer = delivery.customerName ?? t("customerPending");
            const slot = format.dateTime(new Date(delivery.startAt), {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <ListRow
                key={delivery.id}
                icon={<CarsIcon />}
                title={`${customer} · ${delivery.vehicleName}`}
                meta={
                  <>
                    {`${slot} · `}
                    <span className={styles.contractId} dir="ltr">
                      {delivery.contractNumber}
                    </span>
                  </>
                }
                trailing={<ContractStatusChip status={delivery.status} />}
                onClick={() => onOpenContract(delivery.id)}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
