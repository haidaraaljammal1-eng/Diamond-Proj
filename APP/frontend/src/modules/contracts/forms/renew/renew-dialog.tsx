"use client";

import { useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
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
import styles from "./renew-dialog.module.css";

export interface RenewDialogProps {
  contractId: string | null;
  onClose: () => void;
}

export function RenewDialog({ contractId, onClose }: RenewDialogProps) {
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
        <RenewForm key={contractId} contractId={contractId} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function RenewForm({
  contractId,
  onClose,
}: {
  contractId: string;
  onClose: () => void;
}) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const { detail, renew, generateRenewalLink, renewPending, renewError } = useContract();
  const keyRef = useRef(createIdempotencyKey());
  const [officeConfirm, setOfficeConfirm] = useState<RenewFormValues | null>(null);
  const methods = useForm<RenewFormValues>({
    resolver: zodResolver(renewFormSchema) as never,
    defaultValues: { additionalDays: 7, additionalAmount: 0 },
  });

  const fields = useMemo<FormField<RenewFormValues>[]>(
    () => [
      { name: "additionalDays", type: "text", placeholder: t("renew.days"), colSpan: 1 },
      { name: "additionalAmount", type: "text", placeholder: t("renew.amount"), colSpan: 1 },
    ],
    [t],
  );

  const errorMessage = resolveContractsErrorMessage(t, renewError);
  const currentEnd = detail?.endAt ? format.dateTime(new Date(detail.endAt), { dateStyle: "medium" }) : "—";

  return (
    <FormProvider {...methods}>
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
      <form
        className={styles.form}
        onSubmit={methods.handleSubmit(async (values) => {
          const ok = await generateRenewalLink(contractId, values);
          if (ok) onClose();
        })}
        noValidate
      >
        <div className={styles.fields}>
          {fields.map((field) => (
            <FieldRenderer key={String(field.name)} field={field} />
          ))}
        </div>
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
              if (values.additionalAmount <= 0) {
                void renew(contractId, values, keyRef.current).then((ok) => {
                  if (ok) onClose();
                });
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
                {t("renew.officeCurrentEnd")}: <b>{currentEnd}</b>
              </li>
              <li>
                {t("renew.days")}: <b>{officeConfirm.additionalDays}</b>
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
                void renew(contractId, officeConfirm, keyRef.current).then((ok) => {
                  if (ok) {
                    setOfficeConfirm(null);
                    onClose();
                  }
                })
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
