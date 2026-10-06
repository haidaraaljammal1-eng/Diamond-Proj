"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card/card";
import type { PublicRentalContext } from "../../types/public-rental.types";
import { formatRentalAmount } from "../../utils/format-money";
import { formatRentalDuration } from "@/modules/contracts/utils/format-rental-duration";
import styles from "./rental-summary.module.css";

interface RentalSummaryProps {
  context: PublicRentalContext;
}

export function RentalSummary({ context }: RentalSummaryProps) {
  const t = useTranslations("PublicRental.summary");
  const td = useTranslations("Contracts.duration");
  const amount = formatRentalAmount(
    context.rental.agreedAmount,
    context.rental.currency,
  );
  const duration = formatRentalDuration(
    {
      durationValue: context.rental.durationValue,
      durationUnit: context.rental.durationUnit,
    },
    (key, values) => td(key, values),
  );
  const vehicleLabel =
    context.vehicle.vehicleType &&
    context.vehicle.vehicleType !== context.vehicle.displayName
      ? `${context.vehicle.displayName} · ${context.vehicle.vehicleType}`
      : context.vehicle.displayName;

  return (
    <Card className={styles.root} data-testid="rental-summary-card">
      <header className={styles.header}>
        <Card.Title>{t("title")}</Card.Title>
        <div className={styles.priceBlock}>
          <span className={styles.priceCaption}>{t("total")}</span>
          <p className={styles.amount} dir="ltr" data-testid="summary-amount">
            {amount}
          </p>
        </div>
      </header>

      <div className={styles.detailsPanel}>
        <dl className={styles.rows} data-testid="rental-summary-grid">
          <dt className={styles.label} data-testid="summary-label-vehicle">
            {t("vehicle")}
          </dt>
          <dd className={styles.value} data-testid="summary-value-vehicle">
            {vehicleLabel}
          </dd>

          {context.vehicle.plateNumber ? (
            <>
              <dt className={styles.label} data-testid="summary-label-plate">
                {t("plate")}
              </dt>
              <dd className={styles.value} dir="ltr" data-testid="summary-value-plate">
                {context.vehicle.plateNumber}
              </dd>
            </>
          ) : null}

          <dt className={styles.label} data-testid="summary-label-duration">
            {t("duration")}
          </dt>
          <dd className={styles.value} dir="ltr" data-testid="summary-value-duration">
            {duration}
          </dd>

          <dt className={styles.label} data-testid="summary-label-total">
            {t("total")}
          </dt>
          <dd className={styles.value} dir="ltr" data-testid="summary-value-total">
            {amount}
          </dd>
        </dl>
      </div>

      <footer className={styles.noteWrap}>
        <p className={styles.note}>{t("readOnly")}</p>
      </footer>
    </Card>
  );
}
