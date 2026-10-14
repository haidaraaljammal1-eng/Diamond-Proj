"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { FieldRenderer } from "@/shared/components/forms/form-builder/field-renderer";
import type { FormField } from "@/shared/components/forms/form-builder";
import { useContract } from "../../hooks/use-contract";
import { renewFormSchema, type RenewFormValues } from "./renew.schema";
import { createIdempotencyKey } from "../../utils/contract-link";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import { formatRentalDuration } from "../../utils/format-rental-duration";
import { previewRenewalEndAt, toRenewPayload } from "./renew-payload";
import styles from "./renew-dialog.module.css";

const HOUR_QUICK = [1, 3, 6, 12, 24] as const;
const DAY_QUICK = [1, 2, 3, 7] as const;

function coercePositiveInt(value: unknown): number {
  if (value === "" || value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function coerceNonNegativeInt(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export interface RenewDialogProps {
  contractId: string | null;
  onClose: () => void;
  onCompleted?: () => void;
}

export function RenewDialog({ contractId, onClose, onCompleted }: RenewDialogProps) {
  const t = useTranslations("Contracts");
  return (
    <Dialog
      open={contractId != null}
      onClose={onClose}
      title={t("renew.title")}
      description={t("renew.description")}
      closeLabel={t("detail.close")}
    >
      {contractId ? (
        <RenewForm
          key={contractId}
          contractId={contractId}
          onClose={onClose}
          onCompleted={onCompleted}
        />
      ) : null}
    </Dialog>
  );
}

function RenewForm({
  contractId,
  onClose,
  onCompleted,
}: {
  contractId: string;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const { detail, loadContract, renew, generateRenewalLink, renewPending, renewError } =
    useContract();
  const keyRef = useRef(createIdempotencyKey());
  const [officeConfirm, setOfficeConfirm] = useState<RenewFormValues | null>(null);
  const methods = useForm<RenewFormValues>({
    resolver: zodResolver(renewFormSchema) as never,
    defaultValues: { durationUnit: "DAY", durationValue: 7, additionalAmount: 0 },
  });

  useEffect(() => {
    void loadContract(contractId);
  }, [contractId, loadContract]);

  const durationUnit = useWatch({ control: methods.control, name: "durationUnit" });
  const durationValue = useWatch({ control: methods.control, name: "durationValue" });
  const additionalAmount = useWatch({ control: methods.control, name: "additionalAmount" });

  const durationField: FormField<RenewFormValues> = useMemo(
    () => ({
      name: "durationValue",
      type: "text",
      placeholder: durationUnit === "HOUR" ? t("renew.hoursField") : t("renew.daysField"),
      colSpan: 1,
    }),
    [t, durationUnit],
  );
  const amountField: FormField<RenewFormValues> = useMemo(
    () => ({
      name: "additionalAmount",
      type: "text",
      placeholder: t("renew.amount"),
      colSpan: 1,
    }),
    [t],
  );

  const durationLabel =
    durationUnit === "HOUR" ? t("renew.durationLabelHours") : t("renew.durationLabelDays");

  const errorMessage = resolveContractsErrorMessage(t, renewError);
  const previousEndAt = detail?.endAt ? new Date(detail.endAt) : null;
  const currentEndLabel =
    previousEndAt != null
      ? format.dateTime(previousEndAt, { dateStyle: "medium", timeStyle: "short" })
      : "—";
  const safeDurationValue = coercePositiveInt(durationValue);
  const addedDurationLabel =
    safeDurationValue > 0
      ? formatRentalDuration(
          { durationValue: safeDurationValue, durationUnit },
          (key, values) => t(`renew.duration.${key}`, values),
        )
      : "—";
  const newEndLabel =
    previousEndAt != null && safeDurationValue > 0
      ? format.dateTime(
          previewRenewalEndAt(previousEndAt, safeDurationValue, durationUnit),
          { dateStyle: "medium", timeStyle: "short" },
        )
      : "—";
  const parsedAmount = coerceNonNegativeInt(additionalAmount);
  const amountLabel =
    parsedAmount != null ? `${format.number(parsedAmount)} AED` : "—";

  const quickOptions = durationUnit === "HOUR" ? HOUR_QUICK : DAY_QUICK;

  const finish = (ok: boolean) => {
    if (!ok) return;
    onCompleted?.();
    onClose();
  };

  return (
    <FormProvider {...methods}>
      {errorMessage ? (
        <p className={styles.error} role="alert">{errorMessage}</p>
      ) : null}
      <div className={styles.modeRow} role="group" aria-label={t("renew.modeLabel")}>
        <Button
          type="button"
          size="sm"
          variant={durationUnit === "HOUR" ? "primary" : "secondary"}
          onClick={() => methods.setValue("durationUnit", "HOUR")}
        >
          {t("renew.modeHours")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={durationUnit === "DAY" ? "primary" : "secondary"}
          onClick={() => methods.setValue("durationUnit", "DAY")}
        >
          {t("renew.modeDays")}
        </Button>
      </div>
      <div className={styles.quickRow}>
        {quickOptions.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant="secondary"
            className={styles.quickChip}
            onClick={() => methods.setValue("durationValue", value, { shouldValidate: true })}
          >
            {value}
          </Button>
        ))}
      </div>
      <form
        className={styles.form}
        onSubmit={methods.handleSubmit(async (values) => {
          const ok = await generateRenewalLink(contractId, toRenewPayload(values));
          finish(ok);
        })}
        noValidate
      >
        <div className={styles.fields}>
          <div className={styles.fieldBlock}>
            <p className={styles.fieldLabel} id="renew-duration-label">
              {durationLabel}
            </p>
            <FieldRenderer field={durationField} />
            <p className={styles.fieldHint}>{t("renew.durationHint")}</p>
          </div>
          <div className={styles.fieldBlock}>
            <p className={styles.fieldLabel} id="renew-price-label">
              {t("renew.priceLabel")}
            </p>
            <FieldRenderer field={amountField} />
            <p className={styles.fieldHint}>{t("renew.priceHint")}</p>
          </div>
        </div>
        <dl className={styles.preview}>
          <div>
            <dt>{t("renew.previewCurrentEnd")}</dt>
            <dd>{currentEndLabel}</dd>
          </div>
          <div>
            <dt>{t("renew.previewAdded")}</dt>
            <dd>{addedDurationLabel}</dd>
          </div>
          <div>
            <dt>{t("renew.previewNewEnd")}</dt>
            <dd>{newEndLabel}</dd>
          </div>
          <div>
            <dt>{t("renew.previewAmount")}</dt>
            <dd>{amountLabel}</dd>
          </div>
        </dl>
        <div className={styles.actions}>
          <Button type="submit" size="md" loading={renewPending || methods.formState.isSubmitting}>
            {t("renew.link")}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
      <div className={styles.linkRow}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={renewPending}
          onClick={() =>
            void methods.handleSubmit((values) => {
              const payload = toRenewPayload(values);
              if (values.additionalAmount <= 0) {
                void renew(contractId, payload, keyRef.current).then((ok) => finish(ok));
                return;
              }
              setOfficeConfirm(values);
            })()
          }
        >
          {t("renew.applyOffice")}
        </Button>
      </div>
      <Dialog
        open={officeConfirm != null}
        onClose={() => setOfficeConfirm(null)}
        title={t("renew.officeConfirmTitle")}
        description={t("renew.officeConfirmLead")}
        closeLabel={t("common.cancel")}
      >
        {officeConfirm ? (
          <div className={styles.officeConfirm}>
            <p>{t("renew.officeConfirmBody")}</p>
            <ul className={styles.officeList}>
              <li>
                {t("renew.officeCurrentEnd")}: <b>{currentEndLabel}</b>
              </li>
              <li>
                {t("renew.previewAdded")}:{" "}
                <b>
                  {formatRentalDuration(
                    {
                      durationValue: officeConfirm.durationValue,
                      durationUnit: officeConfirm.durationUnit,
                    },
                    (key, values) => t(`renew.duration.${key}`, values),
                  )}
                </b>
              </li>
              <li>
                {t("renew.amount")}: <b>{format.number(officeConfirm.additionalAmount)} AED</b>
              </li>
            </ul>
            <Button
              type="button"
              size="md"
              loading={renewPending}
              onClick={() =>
                void renew(contractId, toRenewPayload(officeConfirm), keyRef.current).then(
                  (ok) => {
                    if (ok) {
                      setOfficeConfirm(null);
                      finish(true);
                    }
                  },
                )
              }
            >
              {t("renew.officeConfirmSubmit")}
            </Button>
          </div>
        ) : null}
      </Dialog>
    </FormProvider>
  );
}
