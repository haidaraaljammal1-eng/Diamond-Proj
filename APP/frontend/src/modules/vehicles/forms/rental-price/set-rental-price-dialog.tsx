"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import type { FormField } from "@/shared/components/forms/form-builder";
import { useContract } from "@/modules/contracts/hooks/use-contract";
import type {
  ContractDurationUnit,
  ContractPriceType,
  CreateContractOfferPayload,
  RentalCollectionMode,
} from "@/modules/contracts/types/contract.types";
import { resolveContractsErrorMessage } from "@/modules/contracts/utils/resolve-contracts-error";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { defaultRateForPriceType } from "../../utils/vehicle-pricing";
import {
  customRentalPriceFormSchema,
  defaultDaysForPriceType,
  DURATION_UNITS,
  isStandardPriceType,
  priceTypeChipKey,
  PRICE_TYPES,
  toCustomRentalPricePayload,
  type CustomRentalPriceFormValues,
} from "./set-rental-price.schema";
import styles from "./set-rental-price-dialog.module.css";

export interface SetRentalPriceDialogProps {
  vehicle: VehicleCardDto | null;
  collectionMode: RentalCollectionMode | null;
  onClose: () => void;
}

export function SetRentalPriceDialog({
  vehicle,
  collectionMode,
  onClose,
}: SetRentalPriceDialogProps) {
  if (!vehicle || !collectionMode) return null;
  return (
    <SetRentalPriceForm
      key={`${vehicle.id}-${collectionMode}`}
      vehicle={vehicle}
      collectionMode={collectionMode}
      onClose={onClose}
    />
  );
}

function SetRentalPriceForm({
  vehicle,
  collectionMode,
  onClose,
}: {
  vehicle: VehicleCardDto;
  collectionMode: RentalCollectionMode;
  onClose: () => void;
}) {
  const t = useTranslations("Vehicles");
  const tc = useTranslations("Contracts");
  const format = useFormatter();
  const [priceType, setPriceType] = useState<ContractPriceType>("DAILY");
  const { createOffer, offerPending, offerError, permissions } = useContract();

  const isCustom = priceType === "CUSTOM";
  const standardAmount = useMemo(
    () => defaultRateForPriceType(vehicle, priceType),
    [vehicle, priceType],
  );
  const standardDays = defaultDaysForPriceType(priceType);
  const canSubmitStandard =
    isStandardPriceType(priceType) &&
    standardAmount != null &&
    standardAmount >= 1 &&
    permissions.canManage &&
    !offerPending;

  const durationUnitOptions = useMemo(
    () =>
      DURATION_UNITS.map((unit) => ({
        value: unit,
        label: t(`setPrice.durationUnit.${unit.toLowerCase()}` as "setPrice.durationUnit.hour"),
      })),
    [t],
  );

  const fields = useMemo<FormField<CustomRentalPriceFormValues>[]>(
    () => [
      {
        name: "durationValue",
        type: "text",
        placeholder: t("setPrice.customDurationValueLabel"),
        colSpan: 1,
      },
      {
        name: "durationUnit",
        type: "select",
        placeholder: t("setPrice.customDurationUnitLabel"),
        options: durationUnitOptions,
        colSpan: 1,
      },
      {
        name: "agreedAmount",
        type: "text",
        placeholder: t("setPrice.customAmountLabel"),
        colSpan: 2,
      },
    ],
    [durationUnitOptions, t],
  );

  const errorMessage = resolveContractsErrorMessage(tc, offerError);

  const buildStandardPayload = (): CreateContractOfferPayload | null => {
    const agreedAmount = defaultRateForPriceType(vehicle, priceType);
    if (agreedAmount == null || agreedAmount < 1) return null;

    const payload: CreateContractOfferPayload = {
      vehicleId: vehicle.id,
      priceType,
      rentalDays: defaultDaysForPriceType(priceType),
      agreedAmount,
      collectionMode,
    };

    if (priceType === "HOURLY") {
      const startAt = new Date();
      const endAt = new Date(startAt.getTime() + 3_600_000);
      payload.startAt = startAt.toISOString();
      payload.endAt = endAt.toISOString();
    }

    return payload;
  };

  const handleStandardSubmit = async () => {
    const payload = buildStandardPayload();
    if (!payload) return;
    const created = await createOffer(payload, true);
    if (created) onClose();
  };

  const rentalDurationLabel = priceType === "HOURLY"
    ? t("setPrice.hours", { count: 1 })
    : t("setPrice.days", { count: standardDays });

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("setPrice.title", { name: vehicle.displayName })}
      description={t("setPrice.description", { plate: vehicle.plateNumber ?? "—" })}
      closeLabel={t("detail.close")}
    >
      {collectionMode === "CASH" ? (
        <p className={styles.pending} data-testid="rental-cash-context">
          <strong>{t("collectionMode.cash.badge")}</strong>
          {" — "}
          {t("collectionMode.cash.pricingHint")}
        </p>
      ) : null}

      <div className={styles.periods}>
        {PRICE_TYPES.map((type) => (
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
            {t(`setPrice.period.${priceTypeChipKey(type)}`)}
          </button>
        ))}
      </div>

      {isCustom ? (
        <>
          <p className={styles.modeHint}>{t("setPrice.customModeHint")}</p>
          {errorMessage ? <p className={styles.pending} role="alert">{errorMessage}</p> : null}
          <FormBuilder
            key={`${vehicle.id}-custom`}
            fields={fields}
            schema={customRentalPriceFormSchema}
            defaultValues={{ durationValue: "", durationUnit: "DAY" as ContractDurationUnit, agreedAmount: "" }}
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
              const parsed = toCustomRentalPricePayload(values);
              const created = await createOffer(
                {
                  vehicleId: vehicle.id,
                  priceType: "CUSTOM",
                  durationValue: parsed.durationValue,
                  durationUnit: parsed.durationUnit,
                  agreedAmount: parsed.agreedAmount,
                  collectionMode,
                },
                true,
              );
              if (created) onClose();
            }}
          />
        </>
      ) : (
        <>
          <p className={styles.modeHint}>{t("setPrice.standardModeHint")}</p>
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span>{t("setPrice.pricingType")}</span>
              <b>{t(`setPrice.period.${priceTypeChipKey(priceType)}`)}</b>
            </div>
            <div className={styles.summaryRow}>
              <span>{t("setPrice.rentalPeriod")}</span>
              <b dir="ltr">{rentalDurationLabel}</b>
            </div>
            <div className={styles.summaryRow}>
              <span>{t("setPrice.defaultPrice")}</span>
              <b dir="ltr" className={styles.readOnlyValue}>
                {standardAmount != null && standardAmount >= 1
                  ? `${format.number(standardAmount)} ${t("currency")}`
                  : t("setPrice.rateMissing")}
              </b>
            </div>
          </div>

          {standardAmount == null || standardAmount < 1 ? (
            <p className={styles.pending} role="status">
              {t("setPrice.rateMissingHint")}
            </p>
          ) : null}

          {errorMessage ? <p className={styles.pending} role="alert">{errorMessage}</p> : null}

          <div className={styles.actions}>
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              {t("setPrice.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={!canSubmitStandard}
              onClick={() => void handleStandardSubmit()}
            >
              {offerPending ? tc("common.saving") : t("setPrice.submit")}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
