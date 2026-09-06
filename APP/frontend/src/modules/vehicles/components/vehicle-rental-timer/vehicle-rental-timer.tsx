"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { getRentalDurationParts } from "../../utils/rental-timer";
import styles from "./vehicle-rental-timer.module.css";

export interface VehicleRentalTimerProps {
  endAt: string;
}

export function VehicleRentalTimer({ endAt }: VehicleRentalTimerProps) {
  const t = useTranslations("Vehicles");
  const format = useFormatter();
  const [parts, setParts] = useState(() => getRentalDurationParts(endAt));

  useEffect(() => {
    const tick = () => setParts(getRentalDurationParts(endAt));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [endAt]);

  const durationLabel = parts.expired
    ? t("timerExpiredValue")
    : t("timerValue", {
        days: format.number(parts.days),
        hours: format.number(parts.hours),
        minutes: format.number(parts.minutes),
      });

  return (
    <div
      className={[styles.timer, parts.expired ? styles.expired : ""].filter(Boolean).join(" ")}
      data-testid="vehicle-rental-timer"
    >
      <span className={styles.label}>
        {parts.expired ? t("timerExpiredLabel") : t("timerLabel")}
      </span>
      <b className={styles.value} dir="ltr">{durationLabel}</b>
    </div>
  );
}
