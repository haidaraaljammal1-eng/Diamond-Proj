"use client";

import { useMemo } from "react";
import { useNow, useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon/icon";
import {
  formatRentalDurationCompact,
  getRentalDurationParts,
} from "../../utils/rental-timer";
import styles from "./vehicle-rental-timer.module.css";

export interface VehicleRentalTimerProps {
  endAt: string;
}

export function VehicleRentalTimer({ endAt }: VehicleRentalTimerProps) {
  const t = useTranslations("Vehicles");
  const now = useNow({ updateInterval: 30_000 });

  const parts = useMemo(
    () => getRentalDurationParts(endAt, now.getTime()),
    [endAt, now],
  );

  const durationLabel = useMemo(() => formatRentalDurationCompact(parts), [parts]);
  const isUrgent = !parts.expired && parts.days === 0;

  return (
    <div
      className={[
        styles.timer,
        parts.expired ? styles.expired : "",
        isUrgent ? styles.urgent : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="vehicle-rental-timer"
    >
      <Icon
        name={parts.expired ? "mdi:clock-alert-outline" : "mdi:timer-outline"}
        size={14}
        className={styles.icon}
      />

      {parts.expired ? (
        <span className={styles.expiredText}>{t("timerExpiredLabel")}</span>
      ) : (
        <div className={styles.content}>
          <span className={styles.label}>{t("timerLabel")}</span>
          <span className={styles.value} dir="ltr">
            {durationLabel}
          </span>
        </div>
      )}
    </div>
  );
}
