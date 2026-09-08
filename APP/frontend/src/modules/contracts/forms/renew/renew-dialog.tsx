"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { FormBuilder } from "@/shared/components/forms/form-builder";
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
  const { renew, generateRenewalLink, renewPending, renewError } = useContract();
  const keyRef = useRef(createIdempotencyKey());

  const fields = useMemo<FormField<RenewFormValues>[]>(
    () => [
      { name: "additionalDays", type: "text", placeholder: t("renew.days"), colSpan: 1 },
      { name: "additionalAmount", type: "text", placeholder: t("renew.amount"), colSpan: 1 },
    ],
    [t],
  );

  const errorMessage = resolveContractsErrorMessage(t, renewError);

  return (
    <>
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
      <FormBuilder
        fields={fields}
        schema={renewFormSchema}
        defaultValues={{ additionalDays: 7, additionalAmount: 0 }}
        submitLabel={t("renew.submit")}
        submittingLabel={t("common.saving")}
        submitSize="md"
        submitDisabled={renewPending}
        secondaryAction={
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        }
        onSubmit={async (values) => {
          const parsed = renewFormSchema.parse(values);
          const ok = await renew(contractId, parsed, keyRef.current);
          if (ok) onClose();
        }}
      />
      <div className={styles.linkRow}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={renewPending}
          onClick={() => void generateRenewalLink(contractId)}
        >
          {t("renew.link")}
        </Button>
      </div>
    </>
  );
}
