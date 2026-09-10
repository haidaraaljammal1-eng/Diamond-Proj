"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { formatAed } from "@/modules/dashboard/utils/money";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import type { RoadLiabilityDetailDto } from "../../types/road-liabilities.types";
import type {
  ConfirmRoadLiabilityChargePayload,
  RoadLiabilityCustomerChargeReviewDto,
} from "../../types/road-liability-charge-review.types";
import {
  additionalChargePreview,
  buildConfirmChargePayload,
  CHARGE_REVIEW_NOTE_MAX,
  CHARGE_REVIEW_REASON_SUGGESTIONS,
  chargeReviewErrorKey,
  parseWholeAed,
  validateCustomerCharge,
} from "../../utils/road-liability-charge-review";
import { typeTranslationKey } from "../../utils/road-liability-status";
import styles from "./road-liability-charge-review.module.css";

export interface RoadLiabilityChargeReviewDialogProps {
  open: boolean;
  detail: RoadLiabilityDetailDto;
  review: RoadLiabilityCustomerChargeReviewDto;
  submitting: boolean;
  submitError: ApiRequestError | null;
  onClose: () => void;
  onConfirm: (payload: ConfirmRoadLiabilityChargePayload) => Promise<boolean>;
}

export function RoadLiabilityChargeReviewDialog({
  open,
  detail,
  review,
  submitting,
  submitError,
  onClose,
  onConfirm,
}: RoadLiabilityChargeReviewDialogProps) {
  const t = useTranslations("RoadLiabilities");
  const destinationNote =
    review.destination === "POST_CLOSE_RECEIVABLE"
      ? t("charge.destinationPostClose")
      : t("charge.destinationReconciliation");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("charge.dialogTitle")}
      description={destinationNote}
      closeLabel={t("detail.close")}
    >
      {open ? (
        <ChargeReviewForm
          key={`${detail.id}:${review.destination ?? "none"}`}
          detail={detail}
          review={review}
          submitting={submitting}
          submitError={submitError}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}

function ChargeReviewForm({
  detail,
  review,
  submitting,
  submitError,
  onClose,
  onConfirm,
}: Omit<RoadLiabilityChargeReviewDialogProps, "open">) {
  const t = useTranslations("RoadLiabilities");
  const amountId = useId();
  const reasonId = useId();
  const noteId = useId();
  const amountErrorId = useId();
  const reasonErrorId = useId();
  const officialId = useId();
  const [amountRaw, setAmountRaw] = useState(String(review.suggestedCustomerChargeAmount));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const parsed = parseWholeAed(amountRaw);
  const additional =
    parsed != null ? additionalChargePreview(review.officialAmount, parsed) : 0;

  const submitErrorMessage = useMemo(() => {
    if (!submitError) return null;
    return t(chargeReviewErrorKey(submitError));
  }, [submitError, t]);

  return (
    <form
      data-testid="road-liability-charge-dialog"
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting) return;
        const customerChargeAmount = parseWholeAed(amountRaw);
        const validated = validateCustomerCharge({
          officialAmount: review.officialAmount,
          minimumCustomerChargeAmount: review.minimumCustomerChargeAmount,
          customerChargeAmount,
          adjustmentReason: reason,
        });
        setAmountError(validated.field === "amount" ? t(validated.errorKey!) : null);
        setReasonError(validated.field === "reason" ? t(validated.errorKey!) : null);
        if (!validated.customerChargeAmount) return;
        const payload = buildConfirmChargePayload({
          officialAmount: review.officialAmount,
          customerChargeAmount: validated.customerChargeAmount,
          adjustmentReason: reason,
          adjustmentNote: note,
        });
        await onConfirm(payload);
      }}
    >
      <div className={styles.summary}>
        <b>{t(typeTranslationKey(detail.type))}</b>
        <span>{detail.vehicle?.displayName}</span>
        <span className={styles.meta} dir="ltr">
          {detail.vehicle?.plateNumber}
        </span>
        <span className={styles.meta} dir="ltr">
          {detail.contract?.contractNumber}
        </span>
        <span>{detail.customer?.displayName}</span>
      </div>

      <dl className={styles.officialPlate} aria-labelledby={officialId}>
        <dt id={officialId}>{t("charge.officialAmount")}</dt>
        <dd dir="ltr" data-testid="road-liability-charge-official">
          {formatAed(review.officialAmount)}
        </dd>
      </dl>
      <p className={styles.lockBanner} id={`${amountId}-hint`}>
        {t("charge.officialHint")}
      </p>

      <div className={styles.field}>
        <label htmlFor={amountId}>{t("charge.customerCharge")}</label>
        <Input
          id={amountId}
          name="customerChargeAmount"
          inputMode="numeric"
          autoComplete="off"
          value={amountRaw}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={`${amountId}-hint${amountError ? ` ${amountErrorId}` : ""}`}
          data-testid="road-liability-charge-amount"
          onChange={(event) => {
            setAmountRaw(event.target.value.replace(/[^\d]/g, ""));
            setAmountError(null);
          }}
        />
        <p className={styles.note}>
          {t("charge.minimumHint", { amount: formatAed(review.minimumCustomerChargeAmount) })}
        </p>
        {amountError ? (
          <p id={amountErrorId} className={styles.error} role="alert">
            {amountError}
          </p>
        ) : null}
      </div>

      <div className={styles.preview} data-testid="road-liability-charge-additional">
        <span>{t("charge.additional")}</span>
        <b dir="ltr">{formatAed(Math.max(0, additional))}</b>
      </div>

      {additional > 0 ? (
        <div className={styles.field}>
          <label htmlFor={reasonId}>{t("charge.reason")}</label>
          <div className={styles.chips} role="group" aria-label={t("charge.reason")}>
            {CHARGE_REVIEW_REASON_SUGGESTIONS.map((key) => {
              const label = t(`charge.reasonSuggestion.${key}`);
              const active = reason === label;
              return (
                <button
                  key={key}
                  type="button"
                  className={[styles.chip, active ? styles.chipActive : ""].filter(Boolean).join(" ")}
                  aria-pressed={active}
                  onClick={() => {
                    setReason(label);
                    setReasonError(null);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Input
            id={reasonId}
            name="adjustmentReason"
            value={reason}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? reasonErrorId : undefined}
            data-testid="road-liability-charge-reason"
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
          />
          {reasonError ? (
            <p id={reasonErrorId} className={styles.error} role="alert">
              {reasonError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor={noteId}>{t("charge.note")}</label>
        <textarea
          id={noteId}
          name="adjustmentNote"
          className={styles.textarea}
          maxLength={CHARGE_REVIEW_NOTE_MAX}
          value={note}
          data-testid="road-liability-charge-note"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {submitErrorMessage ? (
        <p className={styles.error} role="alert">
          {submitErrorMessage}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={submitting}>
          {t("charge.cancel")}
        </Button>
        <Button
          type="submit"
          size="md"
          loading={submitting}
          data-testid="road-liability-charge-confirm"
        >
          {t("charge.confirm")}
        </Button>
      </div>
    </form>
  );
}
