"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import { RECONCILIATION_LINE_TYPES } from "../../constants/inspection";
import type { ReconciliationLineInput, ReconciliationLineType } from "../../types/contract.types";
import { useContract } from "../../hooks/use-contract";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import styles from "./reconcile-dialog.module.css";

export interface ReconcileDialogProps {
  contractId: string | null;
  onClose: () => void;
  onRequestClose: (id: string) => void;
}

interface DraftLine {
  type: ReconciliationLineType;
  description: string;
  amount: string;
  externalReference: string;
}

const emptyLine = (): DraftLine => ({
  type: "OTHER",
  description: "",
  amount: "",
  externalReference: "",
});

export function ReconcileDialog({
  contractId,
  onClose,
  onRequestClose,
}: ReconcileDialogProps) {
  const t = useTranslations("Contracts");
  return (
    <Dialog
      open={contractId != null}
      onClose={onClose}
      title={t("reconcile.title")}
      description={t("reconcile.description")}
      closeLabel={t("detail.close")}
    >
      {contractId ? (
        <ReconcileForm
          key={contractId}
          contractId={contractId}
          onClose={onClose}
          onRequestClose={onRequestClose}
        />
      ) : null}
    </Dialog>
  );
}

function ReconcileForm({
  contractId,
  onClose,
  onRequestClose,
}: {
  contractId: string;
  onClose: () => void;
  onRequestClose: (id: string) => void;
}) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const {
    detail,
    reconcile,
    reconcilePending,
    reconcileError,
    permissions,
    loadContract,
  } = useContract();
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  useEffect(() => {
    void loadContract(contractId);
  }, [contractId, loadContract]);

  const errorMessage = resolveContractsErrorMessage(t, reconcileError);
  const saved = detail?.id === contractId ? detail.reconciliation : null;

  const handleSave = async () => {
    const payload: ReconciliationLineInput[] = lines
      .filter((line) => line.description.trim() && line.amount.trim())
      .map((line) => ({
        type: line.type,
        description: line.description.trim(),
        amount: Number.parseInt(line.amount, 10),
        externalReference: line.externalReference.trim() || null,
      }));
    if (payload.length === 0) return;
    await reconcile(contractId, { lines: payload });
  };

  return (
    <>
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}

      {detail?.carOut && detail.carIn ? (
        <div className={styles.compare}>
          <p>
            {t("carOut.mileage")}: {format.number(detail.carOut.mileageOut)} → {format.number(detail.carIn.mileageIn)}
          </p>
          <p>
            {t("carOut.fuel")}: {detail.carOut.fuelOut} → {detail.carIn.fuelIn}
          </p>
        </div>
      ) : null}

      {lines.map((line, index) => (
        <div key={index} className={styles.line}>
          <Select
            size="sm"
            options={RECONCILIATION_LINE_TYPES.map((type) => ({
              value: type,
              label: t(`reconcile.type.${type}`),
            }))}
            value={line.type}
            onChange={(value) => {
              const next = [...lines];
              next[index] = { ...line, type: value as ReconciliationLineType };
              setLines(next);
            }}
            aria-label={t("reconcile.lineType")}
          />
          <Input
            value={line.description}
            placeholder={t("reconcile.descriptionField")}
            onChange={(event) => {
              const next = [...lines];
              next[index] = { ...line, description: event.target.value };
              setLines(next);
            }}
          />
          <Input
            inputMode="numeric"
            value={line.amount}
            placeholder={t("reconcile.amount")}
            onChange={(event) => {
              const next = [...lines];
              next[index] = { ...line, amount: event.target.value };
              setLines(next);
            }}
          />
          <Input
            value={line.externalReference}
            placeholder={t("reconcile.reference")}
            onChange={(event) => {
              const next = [...lines];
              next[index] = { ...line, externalReference: event.target.value };
              setLines(next);
            }}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setLines((current) => [...current, emptyLine()])}
      >
        {t("reconcile.addLine")}
      </Button>

      {saved ? (
        <div className={styles.totals}>
          <p>{t("reconcile.charges")}: {format.number(saved.chargesTotal)}</p>
          <p>{t("reconcile.final")}: {format.number(saved.finalAmount)}</p>
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button
          type="button"
          size="md"
          loading={reconcilePending}
          onClick={() => void handleSave()}
        >
          {t("reconcile.submit")}
        </Button>
        {saved?.approvedAt && permissions.canClose ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => {
              if (contractId) onRequestClose(contractId);
            }}
          >
            {t("actions.close")}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </>
  );
}
