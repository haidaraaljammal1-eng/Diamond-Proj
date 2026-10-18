"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import {
  createStaffChargeDialogResetState,
  isStaffChargeReferenceValid,
  parseStaffChargeReference,
  parseWholeAed,
  shouldAutoCloseStaffChargeDialog,
  shouldClearStaffChargeInputsAfterOutcome,
  shouldShowSuccessHighlight,
  resolveStaffChargeFailureMessage,
  staffChargeOutcomeMessageKey,
  staffChargeSuccessMessageKey,
  staffChargeReferenceLabelKey,
  staffChargeReferenceRequiredKey,
  isStaffChargeSuccessPendingClose,
  STAFF_CHARGE_SUCCESS_CLOSE_MS,
} from "./staff-contract-charge-dialog.logic";

export interface StaffContractChargeDialogProps {
  open: boolean;
  contract: ReturnedContractListItemDto | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function StaffContractChargeDialog({
  open,
  contract,
  onClose,
  onSuccess,
}: StaffContractChargeDialogProps) {
  const t = useTranslations("RoadLiabilities.staffCharge");
  const tRoot = useTranslations("RoadLiabilities");
  const locale = useLocale();
  const [category, setCategory] = useState<StaffRoadChargeCategory>("TRAFFIC_VIOLATION");
  const [referenceRaw, setReferenceRaw] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [successHighlight, setSuccessHighlight] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      const reset = createStaffChargeDialogResetState();
      setCategory(reset.category);
      setReferenceRaw(reset.referenceRaw);
      setAmountRaw(reset.amountRaw);
      setConfirming(reset.confirming);
      setSubmitting(reset.submitting);
      setError(reset.error);
      setResultMessage(reset.resultMessage);
      setSuccessHighlight(reset.successHighlight);
      setReferenceError(reset.referenceError);
    }
  }, [open]);

  const referenceNumber = useMemo(() => parseStaffChargeReference(referenceRaw), [referenceRaw]);
  const amount = useMemo(() => parseWholeAed(amountRaw), [amountRaw]);
  const categoryLabel = useMemo(() => {
    if (category === "TRAFFIC_VIOLATION") return t("typeTraffic");
    return t("typeSalik");
  }, [category, t]);

  const savedCard =
    contract?.savedPaymentMethod?.brand && contract.savedPaymentMethod.last4
      ? `${contract.savedPaymentMethod.brand} ···· ${contract.savedPaymentMethod.last4}`
      : null;

  const successPendingClose = isStaffChargeSuccessPendingClose(successHighlight, resultMessage);

  const canProceed =
    contract != null &&
    amount != null &&
    referenceNumber.length > 0 &&
    contract.cardAvailability === "available";

  function validateReference(): boolean {
    if (!isStaffChargeReferenceValid(referenceRaw)) {
      setReferenceError(t(staffChargeReferenceRequiredKey(category)));
      return false;
    }
    setReferenceError(null);
    return true;
  }

  async function handleConfirm() {
    if (!contract || amount == null || submitting) return;
    if (!validateReference()) return;
    setSubmitting(true);
    setError(null);
    setResultMessage(null);
    setSuccessHighlight(false);
    const idempotencyKey = crypto.randomUUID();
    try {
      const result = await postStaffManualCharge(
        contract.contractId,
        {
          chargeCategory: category,
          amountAed: amount,
          referenceNumber,
        },
        idempotencyKey,
      );
      const outcomeStatus = result.status;
      if (shouldAutoCloseStaffChargeDialog(outcomeStatus)) {
        setResultMessage(t(staffChargeSuccessMessageKey(category)));
        setSuccessHighlight(shouldShowSuccessHighlight(outcomeStatus));
        successTimerRef.current = setTimeout(() => {
          successTimerRef.current = null;
          onSuccess();
          onClose();
        }, STAFF_CHARGE_SUCCESS_CLOSE_MS);
        return;
      }
      const failureText = resolveStaffChargeFailureMessage(locale, result.failure);
      const outcomeKey = staffChargeOutcomeMessageKey(outcomeStatus, result.recoveryState);
      if (failureText && outcomeStatus === "failed") {
        setResultMessage(failureText);
      } else if (outcomeKey) {
        setResultMessage(t(outcomeKey));
      } else {
        setResultMessage(t("resultFailed"));
      }
      if (shouldClearStaffChargeInputsAfterOutcome(outcomeStatus)) {
        setReferenceRaw("");
        setAmountRaw("");
        setReferenceError(null);
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
            <p
              className={successHighlight ? styles.successBanner : styles.resultNotice}
              role="status"
              data-testid="staff-charge-result"
            >
              {resultMessage}
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {resolveRoadLiabilitiesErrorMessage(tRoot, error)}
            </p>
          ) : null}

          {successPendingClose ? null : !confirming ? (
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
                <label htmlFor="staff-charge-reference">{t(staffChargeReferenceLabelKey(category))}</label>
                <Input
                  id="staff-charge-reference"
                  value={referenceRaw}
                  onChange={(e) => {
                    setReferenceRaw(e.target.value);
                    if (referenceError) setReferenceError(null);
                  }}
                  dir="ltr"
                  data-testid="staff-charge-reference"
                  autoComplete="off"
                />
                {referenceError ? (
                  <p className={styles.fieldError} role="alert">{referenceError}</p>
                ) : null}
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
                <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!canProceed || submitting}
                  onClick={() => {
                    if (!validateReference()) return;
                    setConfirming(true);
                  }}
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
                <div dir="ltr">{referenceNumber}</div>
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
