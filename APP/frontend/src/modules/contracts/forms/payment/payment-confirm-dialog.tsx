"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import type { FormField } from "@/shared/components/forms/form-builder";
import { useContract } from "../../hooks/use-contract";
import { paymentFormSchema, type PaymentFormValues } from "./payment.schema";
import { createIdempotencyKey } from "../../utils/contract-link";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import styles from "./payment-dialog.module.css";

export interface PaymentConfirmDialogProps {
  contractId: string | null;
  amount: number;
  onClose: () => void;
}

export function PaymentConfirmDialog({
  contractId,
  amount,
  onClose,
}: PaymentConfirmDialogProps) {
  const t = useTranslations("Contracts");
  return (
    <Dialog
      open={contractId != null}
      onClose={onClose}
      title={t("payment.title")}
      description={t("payment.description")}
      closeLabel={t("detail.close")}
    >
      {contractId ? (
        <PaymentForm
          key={contractId}
          contractId={contractId}
          amount={amount}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function PaymentForm({
  contractId,
  amount,
  onClose,
}: {
  contractId: string;
  amount: number;
  onClose: () => void;
}) {
  const t = useTranslations("Contracts");
  const { confirmPayment, paymentPending, paymentError, detail, loadContract } = useContract();
  const keyRef = useRef(createIdempotencyKey());

  useEffect(() => {
    void loadContract(contractId);
  }, [contractId, loadContract]);

  const fields = useMemo<FormField<PaymentFormValues>[]>(
    () => [
      { name: "amount", type: "text", placeholder: t("payment.amount"), colSpan: 2 },
      {
        name: "method",
        type: "select",
        placeholder: t("payment.methodLabel"),
        options: [
          { value: "MANUAL", label: t("payment.method.MANUAL") },
          { value: "BANK_TRANSFER", label: t("payment.method.BANK_TRANSFER") },
          { value: "CARD", label: t("payment.method.CARD") },
        ],
        colSpan: 2,
      },
      {
        name: "externalReference",
        type: "text",
        placeholder: t("payment.reference"),
        colSpan: 2,
      },
    ],
    [t],
  );

  const errorMessage = resolveContractsErrorMessage(t, paymentError);

  return (
    <>
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
      <FormBuilder
        key={`${contractId}-${amount > 0 ? amount : detail?.agreedAmount ?? 0}`}
        fields={fields}
        schema={paymentFormSchema}
        defaultValues={{
          amount: amount > 0 ? amount : detail?.agreedAmount ?? 1,
          method: "MANUAL",
          externalReference: "",
        }}
        submitLabel={t("payment.submit")}
        submittingLabel={t("common.saving")}
        submitSize="md"
        submitDisabled={paymentPending}
        secondaryAction={
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        }
        onSubmit={async (values) => {
          const parsed = paymentFormSchema.parse(values);
          const ok = await confirmPayment(
            contractId,
            {
              amount: parsed.amount,
              method: parsed.method,
              externalReference: parsed.externalReference || undefined,
            },
            keyRef.current,
          );
          if (ok) onClose();
        }}
      />
    </>
  );
}
