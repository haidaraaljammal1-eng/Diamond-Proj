"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { formatAed } from "@/modules/dashboard/utils/money";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { resolveRoadLiabilitiesErrorMessage } from "../../utils/resolve-road-liabilities-error";
import type {
  RoadLiabilityCollectionFailureDto,
  RoadLiabilityFailureCustomerDto,
  RoadLiabilityType,
} from "../../types/road-liabilities.types";
import { typeTranslationKey } from "../../utils/road-liability-status";
import styles from "./road-liability-collection-failure-dialog.module.css";

export interface RoadLiabilityCollectionFailureDialogProps {
  open: boolean;
  failure: RoadLiabilityCollectionFailureDto | null;
  submitting: boolean;
  action: "manual" | "paymentLink" | null;
  error: ApiRequestError | null;
  onClose: () => void;
  onManualCollection: () => Promise<void>;
  onPaymentLink: () => Promise<void>;
}

const FAILURE_TYPE_MAP: Record<string, RoadLiabilityType> = {
  RTA_VIOLATION: "rta_violation",
  SALIK_TOLL: "salik_toll",
  SALIK_VIOLATION: "salik_violation",
  rta_violation: "rta_violation",
  salik_toll: "salik_toll",
  salik_violation: "salik_violation",
};

const CUSTOMER_FIELD_KEYS = [
  "fullName",
  "nationality",
  "identityNumber",
  "passportNumber",
  "passportIssueDate",
  "passportExpiryDate",
  "dateOfBirth",
  "sex",
  "issuingCountry",
  "drivingLicenseNumber",
  "drivingLicenseExpiry",
  "telephone",
  "address",
] as const satisfies ReadonlyArray<keyof RoadLiabilityFailureCustomerDto>;

function failureTypeLabel(
  type: string,
  t: ReturnType<typeof useTranslations<"RoadLiabilities">>,
): string {
  const normalized = FAILURE_TYPE_MAP[type];
  return normalized ? t(typeTranslationKey(normalized)) : type;
}

export function RoadLiabilityCollectionFailureDialog({
  open,
  failure,
  submitting,
  action,
  error,
  onClose,
  onManualCollection,
  onPaymentLink,
}: RoadLiabilityCollectionFailureDialogProps) {
  const t = useTranslations("RoadLiabilities");
  const locale = useLocale();
  const errorMessage = useMemo(
    () => resolveRoadLiabilitiesErrorMessage(t, error),
    [error, t],
  );

  const failureMessage =
    failure == null
      ? ""
      : locale === "ar"
        ? failure.failure.messageAr
        : failure.failure.messageEn;

  const customerRows =
    failure == null
      ? []
      : CUSTOMER_FIELD_KEYS.flatMap((key) => {
          const value = failure.customer[key];
          if (!value?.trim()) return [];
          return [{ key, value }];
        });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("collectionFailure.dialogTitle")}
      description={t("collectionFailure.dialogSubtitle")}
      closeLabel={t("detail.close")}
      size="wide"
    >
      {failure ? (
        <>
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t("collectionFailure.violation")}</h4>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>{t("collectionFailure.type")}</dt>
                <dd>{failureTypeLabel(failure.liability.type, t)}</dd>
              </div>
              {failure.liability.externalReference ? (
                <div className={styles.row}>
                  <dt>{t("collectionFailure.reference")}</dt>
                  <dd dir="ltr">{failure.liability.externalReference}</dd>
                </div>
              ) : null}
              {failure.liability.vehicleLabel ? (
                <div className={styles.row}>
                  <dt>{t("collectionFailure.vehicle")}</dt>
                  <dd>{failure.liability.vehicleLabel}</dd>
                </div>
              ) : null}
              {failure.liability.plateNumber ? (
                <div className={styles.row}>
                  <dt>{t("collectionFailure.plate")}</dt>
                  <dd dir="ltr">{failure.liability.plateNumber}</dd>
                </div>
              ) : null}
              {failure.liability.contractNumber ? (
                <div className={styles.row}>
                  <dt>{t("collectionFailure.contract")}</dt>
                  <dd dir="ltr">{failure.liability.contractNumber}</dd>
                </div>
              ) : null}
              {failure.liability.amount != null ? (
                <div className={styles.row}>
                  <dt>{t("collectionFailure.amount")}</dt>
                  <dd dir="ltr">{formatAed(failure.liability.amount)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {customerRows.length > 0 ? (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>{t("collectionFailure.customerSection")}</h4>
              <dl className={styles.rows}>
                {customerRows.map(({ key, value }) => (
                  <div key={key} className={styles.row}>
                    <dt>{t(`collectionFailure.customer.${key}`)}</dt>
                    <dd dir={key === "telephone" || key === "identityNumber" ? "ltr" : undefined}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {failure.savedCard ? (
            <div className={styles.savedCard}>
              <span>{t("collectionFailure.savedCard")}</span>
              <b dir="ltr">
                {t("collect.cardLabel", {
                  brand: failure.savedCard.brand,
                  last4: failure.savedCard.last4,
                })}
              </b>
            </div>
          ) : null}

          <div className={styles.failureReason} role="alert">
            <span>{t("collectionFailure.reason")}</span>
            <p>{failureMessage}</p>
          </div>

          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={submitting}>
              {t("collectionFailure.close")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              loading={submitting && action === "manual"}
              data-testid="road-liability-collection-manual"
              onClick={() => {
                if (submitting) return;
                void onManualCollection();
              }}
            >
              {t("collectionFailure.manualCollection")}
            </Button>
            <Button
              type="button"
              size="md"
              className={styles.collectDanger}
              loading={submitting && action === "paymentLink"}
              data-testid="road-liability-collection-payment-link"
              onClick={() => {
                if (submitting) return;
                void onPaymentLink();
              }}
            >
              {t("collectionFailure.paymentLink")}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
