"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { formatAed } from "@/modules/dashboard/utils/money";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { resolveRoadLiabilitiesErrorMessage } from "../../utils/resolve-road-liabilities-error";
import type {
  RoadLiabilityCollectionViewDto,
  RoadLiabilityListItemDto,
} from "../../types/road-liabilities.types";
import { typeTranslationKey } from "../../utils/road-liability-status";
import styles from "./road-liability-collect-dialog.module.css";

export interface RoadLiabilityCollectDialogProps {
  open: boolean;
  item: RoadLiabilityListItemDto | null;
  view: RoadLiabilityCollectionViewDto | null;
  loading: boolean;
  submitting: boolean;
  error: ApiRequestError | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function formatSavedCard(
  brand: string | undefined,
  last4: string | undefined,
  fallback: string,
): string {
  if (!brand || !last4) return fallback;
  return `${brand} ···· ${last4}`;
}

export function RoadLiabilityCollectDialog({
  open,
  item,
  view,
  loading,
  submitting,
  error,
  onClose,
  onConfirm,
}: RoadLiabilityCollectDialogProps) {
  const t = useTranslations("RoadLiabilities");
  const charge = view?.charge;
  const saved = view?.capability.savedPaymentMethod;
  const errorMessage = useMemo(
    () => resolveRoadLiabilitiesErrorMessage(t, error),
    [error, t],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("collect.dialogTitle")}
      description={t("collect.dialogSubtitle")}
      closeLabel={t("detail.close")}
    >
      {loading || !item || !view || !charge ? (
        <p className={styles.loading}>{t("collect.loading")}</p>
      ) : (
        <>
          <div className={styles.summary}>
            <b>{t(typeTranslationKey(item.type))}</b>
            <span>{item.vehicle?.displayName}</span>
            <span className={styles.meta} dir="ltr">
              {item.vehicle?.plateNumber ?? t("noPlate")}
            </span>
          </div>

          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt>{t("collect.officialAmount")}</dt>
              <dd dir="ltr">{formatAed(charge.officialAmount)}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t("collect.customerCharge")}</dt>
              <dd dir="ltr">{formatAed(charge.customerChargeAmount)}</dd>
            </div>
            {charge.adjustmentAmount != null && charge.adjustmentAmount > 0 ? (
              <div className={styles.row}>
                <dt>{t("charge.additional")}</dt>
                <dd dir="ltr">{formatAed(charge.adjustmentAmount)}</dd>
              </div>
            ) : null}
            <div className={styles.row}>
              <dt>{t("collect.contract")}</dt>
              <dd dir="ltr">{charge.contractNumber || t("noContract")}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t("collect.customer")}</dt>
              <dd>{charge.customerName ?? item.customer?.displayName ?? t("noCustomer")}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t("collect.savedCard")}</dt>
              <dd dir="ltr">
                {formatSavedCard(saved?.brand, saved?.last4, t("collect.noSavedCard"))}
              </dd>
            </div>
          </dl>

          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={submitting}>
              {t("collect.cancel")}
            </Button>
            <Button
              type="button"
              size="md"
              className={styles.collectDanger}
              loading={submitting}
              data-testid="road-liability-collect-confirm"
              onClick={() => {
                if (submitting) return;
                void onConfirm();
              }}
            >
              {t("collect.confirm")}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
