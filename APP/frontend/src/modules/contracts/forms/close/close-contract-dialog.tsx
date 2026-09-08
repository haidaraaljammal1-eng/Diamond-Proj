"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { useContract } from "../../hooks/use-contract";
import { createIdempotencyKey } from "../../utils/contract-link";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import styles from "./close-dialog.module.css";

export interface CloseContractDialogProps {
  contractId: string | null;
  contractNumber?: string;
  onClose: () => void;
}

export function CloseContractDialog({
  contractId,
  contractNumber,
  onClose,
}: CloseContractDialogProps) {
  const t = useTranslations("Contracts");
  return (
    <Dialog
      open={contractId != null}
      onClose={onClose}
      title={t("close.title")}
      description={
        contractNumber
          ? t("close.description", { number: contractNumber })
          : t("close.descriptionGeneric")
      }
      closeLabel={t("detail.close")}
    >
      {contractId ? (
        <CloseForm
          key={contractId}
          contractId={contractId}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function CloseForm({
  contractId,
  onClose,
}: {
  contractId: string;
  onClose: () => void;
}) {
  const t = useTranslations("Contracts");
  const { close, closePending, closeError } = useContract();
  const keyRef = useRef(createIdempotencyKey());
  const errorMessage = resolveContractsErrorMessage(t, closeError);

  return (
    <>
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
      <div className={styles.actions}>
        <Button
          type="button"
          size="md"
          loading={closePending}
          onClick={async () => {
            const ok = await close(contractId, keyRef.current);
            if (ok) onClose();
          }}
        >
          {t("close.confirm")}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </>
  );
}
