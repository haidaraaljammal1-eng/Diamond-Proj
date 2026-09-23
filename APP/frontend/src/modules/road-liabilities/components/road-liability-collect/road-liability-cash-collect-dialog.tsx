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

export interface RoadLiabilityCashCollectDialogProps {
  open: boolean;
  item: RoadLiabilityListItemDto | null;
  view: RoadLiabilityCollectionViewDto | null;
  loading: boolean;
  submitting: boolean;
  error: ApiRequestError | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function RoadLiabilityCashCollectDialog({
  open,
  item,
  view,
  loading,
  submitting,
  error,
  onClose,
  onConfirm,
}: RoadLiabilityCashCollectDialogProps) {
  const t = useTranslations("RoadLiabilities");
  const charge = view?.charge;
  const errorMessage = useMemo(
    () => resolveRoadLiabilitiesErrorMessage(t, error),
    [error, t],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("collect.cashDialogTitle")}
      description={t("collect.cashDialogSubtitle")}
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
              <dt>{t("collect.contract")}</dt>
              <dd dir="ltr">{charge.contractNumber || t("noContract")}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t("collect.customerCharge")}</dt>
              <dd dir="ltr">{formatAed(charge.customerChargeAmount)}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t("collect.cashPaymentMethod")}</dt>
              <dd>{t("collect.cashPaymentMethodValue")}</dd>
            </div>
          </dl>

          <p className={styles.note}>{t("collect.cashFinanceNote")}</p>

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
              data-testid="road-liability-cash-collect-confirm"
              onClick={() => {
                if (submitting) return;
                void onConfirm();
              }}
            >
              {t("collect.cashConfirm")}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
