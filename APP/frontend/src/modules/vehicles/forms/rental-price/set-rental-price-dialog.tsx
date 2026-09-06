"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { z } from "zod";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import type { FormField } from "@/shared/components/forms/form-builder";
import type { VehicleCardDto } from "../../types/vehicle.types";
import {
  defaultPriceForPeriod,
  RENTAL_PRICE_PERIOD_OPTIONS,
  type RentalPricePeriod,
} from "../../utils/vehicle-pricing";
import styles from "./set-rental-price-dialog.module.css";

const setPriceSchema = z.object({
  amount: z.coerce.number().int().positive(),
});

type SetPriceValues = z.infer<typeof setPriceSchema>;

export interface SetRentalPriceDialogProps {
  vehicle: VehicleCardDto | null;
  onClose: () => void;
}

export function SetRentalPriceDialog({ vehicle, onClose }: SetRentalPriceDialogProps) {
  const t = useTranslations("Vehicles");
  const format = useFormatter();
  const [period, setPeriod] = useState<RentalPricePeriod>("weekly");

  const selected = RENTAL_PRICE_PERIOD_OPTIONS.find((option) => option.key === period)
    ?? RENTAL_PRICE_PERIOD_OPTIONS[1]!;

  const defaultAmount = useMemo(
    () =>
      vehicle
        ? defaultPriceForPeriod(vehicle.dailyRate, vehicle.monthlyRate, period)
        : 0,
    [vehicle, period],
  );

  const fields = useMemo<FormField<SetPriceValues>[]>(
    () => [
      {
        name: "amount",
        type: "text",
        placeholder: t("setPrice.amountLabel"),
        colSpan: 2,
      },
    ],
    [t],
  );

  if (!vehicle) return null;

  return (
    <Dialog
      open={vehicle != null}
      onClose={onClose}
      title={t("setPrice.title", { name: vehicle.displayName })}
      description={t("setPrice.description", { plate: vehicle.plateNumber ?? "—" })}
      closeLabel={t("detail.close")}
    >
      <div className={styles.periods}>
        {RENTAL_PRICE_PERIOD_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={[
              styles.periodChip,
              period === option.key ? styles.periodActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setPeriod(option.key)}
          >
            {t(`setPrice.period.${option.id}`)}
          </button>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>{t("setPrice.rentalPeriod")}</span>
          <b>{t("setPrice.days", { count: selected.days })}</b>
        </div>
        <div className={styles.summaryRow}>
          <span>{t("setPrice.defaultPrice")}</span>
          <b>
            {format.number(defaultAmount)} {t("currency")}
          </b>
        </div>
      </div>

      <FormBuilder
        key={`${vehicle.id}-${period}`}
        fields={fields}
        schema={setPriceSchema}
        defaultValues={{ amount: defaultAmount }}
        submitLabel={t("setPrice.submit")}
        submitSize="md"
        submitDisabled
        secondaryAction={
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("setPrice.cancel")}
          </Button>
        }
        onSubmit={() => {
          /* Contracts domain — no backend operation yet. */
        }}
      />

      <p className={styles.pending} role="status">{t("setPrice.pendingContracts")}</p>
    </Dialog>
  );
}
