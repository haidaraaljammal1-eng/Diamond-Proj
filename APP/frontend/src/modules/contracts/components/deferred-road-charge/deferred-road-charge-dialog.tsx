"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { postDeferredRoadCharge } from "../../api/contracts.api";
import type { ContractDetailDto } from "../../types/contract.types";
import {
  isStaffChargeReferenceValid,
  parseStaffChargeReference,
  parseWholeAed,
  staffChargeReferenceLabelKey,
  staffChargeReferenceRequiredKey,
} from "@/modules/road-liabilities/components/staff-contract-charge/staff-contract-charge-dialog.logic";
import type { StaffRoadChargeCategory } from "@/modules/road-liabilities/types/road-liabilities.types";
import { resolveRoadLiabilitiesErrorMessage } from "@/modules/road-liabilities/utils/resolve-road-liabilities-error";
import styles from "./deferred-road-charge-dialog.module.css";

export interface DeferredRoadChargeDialogProps {
  open: boolean;
  contract: ContractDetailDto | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeferredRoadChargeDialog({
  open,
  contract,
  onClose,
  onSuccess,
}: DeferredRoadChargeDialogProps) {
  const t = useTranslations("Contracts.deferredCharge");
  const tCharge = useTranslations("RoadLiabilities.staffCharge");
  const tRoot = useTranslations("RoadLiabilities");
  const [category, setCategory] = useState<StaffRoadChargeCategory>("TRAFFIC_VIOLATION");
  const [referenceRaw, setReferenceRaw] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCategory("TRAFFIC_VIOLATION");
      setReferenceRaw("");
      setAmountRaw("");
      setSubmitting(false);
      setError(null);
      setSuccessMessage(null);
      setReferenceError(null);
    }
  }, [open]);

  const referenceNumber = useMemo(() => parseStaffChargeReference(referenceRaw), [referenceRaw]);
  const amount = useMemo(() => parseWholeAed(amountRaw), [amountRaw]);

  const canSubmit =
    contract != null && amount != null && referenceNumber.length > 0 && !submitting && !successMessage;

  function validateReference(): boolean {
    if (!isStaffChargeReferenceValid(referenceRaw)) {
      setReferenceError(tCharge(staffChargeReferenceRequiredKey(category)));
      return false;
    }
    setReferenceError(null);
    return true;
  }

  async function handleSubmit() {
    if (!contract || amount == null || submitting) return;
    if (!validateReference()) return;
    setSubmitting(true);
    setError(null);
    try {
      await postDeferredRoadCharge(
        contract.id,
        {
          chargeCategory: category,
          amountAed: amount,
          referenceNumber,
        },
        crypto.randomUUID(),
      );
      setSuccessMessage(t("success"));
      onSuccess();
    } catch (err) {
      setError(err as ApiRequestError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("title")}
      description={t("subtitle")}
      closeLabel={tCharge("close")}
      data-testid="deferred-road-charge-dialog"
    >
      {!contract ? null : (
        <>
          <div className={styles.summary}>
            <strong dir="ltr">{contract.contractNumber}</strong>
            <span>{contract.customer?.name}</span>
            <span dir="ltr">
              {contract.vehicle?.displayName}
              {contract.vehicle?.plateNumber ? ` · ${contract.vehicle.plateNumber}` : ""}
            </span>
          </div>

          {successMessage ? (
            <p className={styles.success} role="status" data-testid="deferred-charge-success">
              {successMessage}
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {resolveRoadLiabilitiesErrorMessage(tRoot, error)}
            </p>
          ) : null}

          {!successMessage ? (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="deferredChargeType"
                    checked={category === "TRAFFIC_VIOLATION"}
                    onChange={() => setCategory("TRAFFIC_VIOLATION")}
                  />
                  {tCharge("typeTraffic")}
                </label>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="deferredChargeType"
                    checked={category === "SALIK"}
                    onChange={() => setCategory("SALIK")}
                  />
                  {tCharge("typeSalik")}
                </label>
              </div>

              <div className={styles.field}>
                <label htmlFor="deferred-reference">{tCharge(staffChargeReferenceLabelKey(category))}</label>
                <Input
                  id="deferred-reference"
                  value={referenceRaw}
                  onChange={(event) => setReferenceRaw(event.target.value)}
                  autoComplete="off"
                  data-testid="deferred-charge-reference"
                />
                {referenceError ? <p className={styles.error}>{referenceError}</p> : null}
              </div>

              <div className={styles.field}>
                <label htmlFor="deferred-amount">{tCharge("amountLabel")}</label>
                <Input
                  id="deferred-amount"
                  value={amountRaw}
                  onChange={(event) => setAmountRaw(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  data-testid="deferred-charge-amount"
                />
              </div>

              <p className={styles.note}>{t("note")}</p>

              <div className={styles.actions}>
                <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={submitting}>
                  {tCharge("cancel")}
                </Button>
                <Button
                  type="button"
                  size="md"
                  loading={submitting}
                  disabled={!canSubmit}
                  data-testid="deferred-charge-submit"
                  onClick={() => void handleSubmit()}
                >
                  {t("submit")}
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.actions}>
              <Button type="button" size="md" onClick={onClose}>
                {tCharge("close")}
              </Button>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
