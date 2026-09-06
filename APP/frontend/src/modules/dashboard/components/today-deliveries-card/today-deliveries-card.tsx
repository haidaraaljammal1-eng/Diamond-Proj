"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { Chip } from "@/shared/components/ui/chip";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { ListRow } from "@/shared/components/ui/list-row";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { contractStatusPresentation } from "../../utils/contract-status";
import type { TodayDelivery } from "../../types/dashboard.types";
import styles from "./today-deliveries-card.module.css";

export interface TodayDeliveriesCardProps {
  deliveries: TodayDelivery[];
  /** Hand-overs already signed and paid — shown as the card's counter chip. */
  readyCount: number;
}

/** Today's hand-overs — the operational half of the Dashboard's second row. */
export function TodayDeliveriesCard({
  deliveries,
  readyCount,
}: TodayDeliveriesCardProps) {
  const t = useTranslations("Dashboard");
  const CarsIcon = NAVIGATION_ICONS.cars;

  return (
    <Card as="section">
      <Card.Title
        icon={<CarsIcon />}
        trailing={
          deliveries.length > 0 ? (
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
            const status = contractStatusPresentation(delivery.status);

            return (
              <ListRow
                key={delivery.id}
                icon={<CarsIcon />}
                title={`${delivery.customerName} · ${delivery.vehicleName}`}
                meta={
                  <>
                    {delivery.slot ? `${delivery.slot} · ` : null}
                    <span className={styles.contractId} dir="ltr">
                      {delivery.id}
                    </span>
                  </>
                }
                trailing={
                  <Chip tone={status.tone} dot>
                    {t(`status.${status.translationKey}`)}
                  </Chip>
                }
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
