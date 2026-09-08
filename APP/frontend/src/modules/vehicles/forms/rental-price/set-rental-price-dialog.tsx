"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { z } from "zod";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import type { FormField } from "@/shared/components/forms/form-builder";
import { useContract } from "@/modules/contracts/hooks/use-contract";
import type { ContractPriceType } from "@/modules/contracts/types/contract.types";
import { defaultDaysForPriceType } from "@/modules/contracts/forms/offer/offer.schema";
import { resolveContractsErrorMessage } from "@/modules/contracts/utils/resolve-contracts-error";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { defaultPriceForPeriod } from "../../utils/vehicle-pricing";
import styles from "./set-rental-price-dialog.module.css";

const setPriceSchema = z.object({
  rentalDays: z.coerce.number().int().positive().max(3650),
  agreedAmount: z.coerce.number().int().positive(),
});

type SetPriceValues = z.infer<typeof setPriceSchema>;

const PRICE_CHIPS: ContractPriceType[] = ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"];

export interface SetRentalPriceDialogProps {
  vehicle: VehicleCardDto | null;
  onClose: () => void;
}

export function SetRentalPriceDialog({ vehicle, onClose }: SetRentalPriceDialogProps) {
  if (!vehicle) return null;
  return <SetRentalPriceForm key={vehicle.id} vehicle={vehicle} onClose={onClose} />;
}

function SetRentalPriceForm({
  vehicle,
  onClose,
}: {
  vehicle: VehicleCardDto;
  onClose: () => void;
}) {
  const t = useTranslations("Vehicles");
  const tc = useTranslations("Contracts");
  const format = useFormatter();
  const [priceType, setPriceType] = useState<ContractPriceType>("WEEKLY");
  const { createOffer, offerPending, offerError, permissions } = useContract();

  const suggestionPeriod =
    priceType === "DAILY" ? "daily" : priceType === "MONTHLY" ? "monthly" : "weekly";

  const defaultAmount = useMemo(
    () => defaultPriceForPeriod(vehicle.dailyRate, vehicle.monthlyRate, suggestionPeriod),
    [vehicle, suggestionPeriod],
  );

  const defaultDays = defaultDaysForPriceType(priceType);

  const fields = useMemo<FormField<SetPriceValues>[]>(
    () => [
      {
        name: "rentalDays",
        type: "text",
        placeholder: t("setPrice.daysLabel"),
        colSpan: 1,
      },
      {
        name: "agreedAmount",
        type: "text",
        placeholder: t("setPrice.amountLabel"),
        colSpan: 1,
      },
    ],
    [t],
  );

  const errorMessage = resolveContractsErrorMessage(tc, offerError);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("setPrice.title", { name: vehicle.displayName })}
      description={t("setPrice.description", { plate: vehicle.plateNumber ?? "—" })}
      closeLabel={t("detail.close")}
    >
      <div className={styles.periods}>
        {PRICE_CHIPS.map((type) => (
          <button
            key={type}
            type="button"
            className={[
              styles.periodChip,
              priceType === type ? styles.periodActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setPriceType(type)}
          >
            {t(`setPrice.period.${type === "DAILY" ? "day" : type === "WEEKLY" ? "week" : type === "MONTHLY" ? "month" : "custom"}`)}
          </button>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span>{t("setPrice.rentalPeriod")}</span>
          <b>{t("setPrice.days", { count: defaultDays })}</b>
        </div>
        <div className={styles.summaryRow}>
          <span>{t("setPrice.defaultPrice")}</span>
          <b>
            {format.number(defaultAmount)} {t("currency")}
          </b>
        </div>
      </div>

      {errorMessage ? <p className={styles.pending} role="alert">{errorMessage}</p> : null}

      <FormBuilder
        key={`${vehicle.id}-${priceType}`}
        fields={fields}
        schema={setPriceSchema}
        defaultValues={{ rentalDays: defaultDays, agreedAmount: defaultAmount || 1 }}
        submitLabel={t("setPrice.submit")}
        submittingLabel={tc("common.saving")}
        submitSize="md"
        submitDisabled={offerPending || !permissions.canManage}
        secondaryAction={
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("setPrice.cancel")}
          </Button>
        }
        onSubmit={async (values) => {
          const parsed = setPriceSchema.parse(values);
          const created = await createOffer(
            {
              vehicleId: vehicle.id,
              priceType,
              rentalDays: parsed.rentalDays,
              agreedAmount: parsed.agreedAmount,
            },
            true,
          );
          if (created) onClose();
        }}
      />
    </Dialog>
  );
}
