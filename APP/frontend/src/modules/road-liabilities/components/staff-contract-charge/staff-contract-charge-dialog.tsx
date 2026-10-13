"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { postStaffManualCharge } from "../../api/returned-contracts.api";
import type {
  ReturnedContractListItemDto,
  StaffRoadChargeCategory,
} from "../../types/road-liabilities.types";
import { resolveRoadLiabilitiesErrorMessage } from "../../utils/resolve-road-liabilities-error";
import styles from "./staff-contract-charge-dialog.module.css";

export interface StaffContractChargeDialogProps {
  open: boolean;
  contract: ReturnedContractListItemDto | null;
  onClose: () => void;
  onSuccess: () => void;
}

function parseWholeAed(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function StaffContractChargeDialog({
  open,
  contract,
  onClose,
  onSuccess,
}: StaffContractChargeDialogProps) {
  const t = useTranslations("RoadLiabilities.staffCharge");
  const tRoot = useTranslations("RoadLiabilities");
  const [category, setCategory] = useState<StaffRoadChargeCategory>("TRAFFIC_VIOLATION");
  const [amountRaw, setAmountRaw] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCategory("TRAFFIC_VIOLATION");
      setAmountRaw("");
      setConfirming(false);
      setSubmitting(false);
      setError(null);
      setResultMessage(null);
    }
  }, [open]);

  const amount = useMemo(() => parseWholeAed(amountRaw), [amountRaw]);
  const categoryLabel = useMemo(() => {
    if (category === "TRAFFIC_VIOLATION") return t("typeTraffic");
    return t("typeSalik");
  }, [category, t]);

  const savedCard =
    contract?.savedPaymentMethod?.brand && contract.savedPaymentMethod.last4
      ? `${contract.savedPaymentMethod.brand} ···· ${contract.savedPaymentMethod.last4}`
      : null;

  const canProceed =
    contract != null && amount != null && contract.cardAvailability === "available";

  async function handleConfirm() {
    if (!contract || amount == null) return;
    setSubmitting(true);
    setError(null);
    setResultMessage(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const result = await postStaffManualCharge(
        contract.contractId,
        {
          chargeCategory: category,
          amountAed: amount,
        },
        idempotencyKey,
      );
      if (result.status === "succeeded") {
        setResultMessage(t("resultSuccess"));
        onSuccess();
      } else if (result.status === "processing") {
        setResultMessage(t("resultProcessing"));
      } else if (result.status === "requires_action") {
        setResultMessage(t("resultRequiresAction"));
      } else if (result.status === "failed") {
        setResultMessage(t("resultFailed"));
      } else {
        setResultMessage(t("resultFailed"));
      }
    } catch (err) {
      setError(err as ApiRequestError);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("title")}
      closeLabel={t("close")}
      data-testid="staff-contract-charge-dialog"
    >
      {!contract ? null : (
        <>
          <div className={styles.summary}>
            <div>
              <strong>{contract.contractNumber}</strong> — {contract.customerName}
            </div>
            <div dir="ltr">
              {contract.vehicleDisplayName} · {contract.plateNumber ?? "—"}
            </div>
            <div>{contract.company?.displayName}</div>
            {savedCard ? <div dir="ltr">{savedCard}</div> : <div>{t("noCard")}</div>}
          </div>

          {contract.cardAvailability !== "available" ? (
            <p className={styles.error} role="alert">{t("noAuthorizedCard")}</p>
          ) : null}

          {resultMessage ? (
            <p className={styles.success} role="status">{resultMessage}</p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {resolveRoadLiabilitiesErrorMessage(tRoot, error)}
            </p>
          ) : null}

          {!confirming ? (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="chargeType"
                    checked={category === "TRAFFIC_VIOLATION"}
                    onChange={() => setCategory("TRAFFIC_VIOLATION")}
                  />
                  {t("typeTraffic")}
                </label>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="chargeType"
                    checked={category === "SALIK"}
                    onChange={() => setCategory("SALIK")}
                  />
                  {t("typeSalik")}
                </label>
              </div>

              <div className={styles.amountRow}>
                <label htmlFor="staff-charge-amount">{t("amountLabel")}</label>
                <Input
                  id="staff-charge-amount"
                  inputMode="numeric"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(e.target.value)}
                  dir="ltr"
                  data-testid="staff-charge-amount"
                />
              </div>

              <div className={styles.actions}>
                <Button type="button" variant="secondary" onClick={onClose}>
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!canProceed || submitting}
                  onClick={() => setConfirming(true)}
                >
                  {t("review")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.confirmBox}>
                <div>{contract.contractNumber}</div>
                <div>{categoryLabel}</div>
                <div dir="ltr">{amount} AED</div>
                {savedCard ? <div dir="ltr">{savedCard}</div> : null}
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => setConfirming(false)}
                >
                  {t("back")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!canProceed || submitting}
                  onClick={() => void handleConfirm()}
                  data-testid="staff-charge-confirm"
                >
                  {t("confirm", { amount: amount ?? 0 })}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
