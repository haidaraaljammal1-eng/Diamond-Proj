"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card/card";
import type { PublicRentalContext } from "../../types/public-rental.types";
import { formatRentalAmount, formatRentalDays } from "../../utils/format-money";
import styles from "./rental-summary.module.css";

interface RentalSummaryProps {
  context: PublicRentalContext;
}

export function RentalSummary({ context }: RentalSummaryProps) {
  const t = useTranslations("PublicRental.summary");
  const amount = formatRentalAmount(
    context.rental.agreedAmount,
    context.rental.currency,
  );
  const duration = formatRentalDays(context.rental.rentalDays, t("days"));
  const vehicleLabel =
    context.vehicle.vehicleType &&
    context.vehicle.vehicleType !== context.vehicle.displayName
      ? `${context.vehicle.displayName} · ${context.vehicle.vehicleType}`
      : context.vehicle.displayName;

  return (
    <Card className={styles.root} data-testid="rental-summary">
      <Card.Title>{t("title")}</Card.Title>
      <p className={styles.amount} dir="ltr">
        {amount}
      </p>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>{t("office")}</dt>
          <dd className={styles.value}>{context.office.displayName}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t("vehicle")}</dt>
          <dd className={styles.value}>{vehicleLabel}</dd>
        </div>
        {context.vehicle.plateNumber ? (
          <div className={styles.row}>
            <dt>{t("plate")}</dt>
            <dd className={styles.value} dir="ltr">
              {context.vehicle.plateNumber}
            </dd>
          </div>
        ) : null}
        <div className={styles.row}>
          <dt>{t("duration")}</dt>
          <dd className={styles.value} dir="ltr">
            {duration}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>{t("total")}</dt>
          <dd className={styles.value} dir="ltr">
            {amount}
          </dd>
        </div>
      </dl>
      <p className={styles.note}>{t("readOnly")}</p>
    </Card>
  );
}
