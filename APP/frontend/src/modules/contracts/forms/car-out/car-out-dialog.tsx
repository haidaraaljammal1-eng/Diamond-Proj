"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import type { FormField } from "@/shared/components/forms/form-builder";
import { INSPECTION_ANGLES } from "../../constants/inspection";
import type { InspectionAngle } from "../../types/contract.types";
import { useContract } from "../../hooks/use-contract";
import { ContractTarsInlineStatus } from "../../components/contract-tars/contract-tars-inline-status";
import { carOutFormSchema, type CarOutFormValues } from "./car-out.schema";
import { createIdempotencyKey } from "../../utils/contract-link";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import styles from "./car-out-dialog.module.css";

export interface CarOutDialogProps {
  contractId: string | null;
  onClose: () => void;
}

const PHOTO_ACCEPT = "image/jpeg,image/png";

export function CarOutDialog({ contractId, onClose }: CarOutDialogProps) {
  const t = useTranslations("Contracts");
  return (
    <Dialog
      open={contractId != null}
      onClose={onClose}
      title={t("carOut.title")}
      description={t("carOut.description")}
      closeLabel={t("detail.close")}
    >
      {contractId ? (
        <CarOutForm key={contractId} contractId={contractId} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function CarOutForm({
  contractId,
  onClose,
}: {
  contractId: string;
  onClose: () => void;
}) {
  const t = useTranslations("Contracts");
  const { submitCarOut, carOutPending, carOutError } = useContract();
  const keyRef = useRef(createIdempotencyKey());
  const [photos, setPhotos] = useState<Partial<Record<InspectionAngle, File>>>({});

  const fields = useMemo<FormField<CarOutFormValues>[]>(
    () => [
      { name: "mileageOut", type: "text", placeholder: t("carOut.mileage"), colSpan: 1 },
      {
        name: "fuelOut",
        type: "select",
        placeholder: t("carOut.fuel"),
        options: [
          { value: "F", label: "F" },
          { value: "7/8", label: "7/8" },
          { value: "3/4", label: "3/4" },
          { value: "5/8", label: "5/8" },
          { value: "1/2", label: "1/2" },
          { value: "3/8", label: "3/8" },
          { value: "1/4", label: "1/4" },
          { value: "1/8", label: "1/8" },
          { value: "E", label: "E" },
        ],
        colSpan: 1,
      },
      { name: "notes", type: "text", placeholder: t("carOut.notes"), colSpan: 2 },
    ],
    [t],
  );

  const ready = INSPECTION_ANGLES.every((angle) => photos[angle]);
  const errorMessage = resolveContractsErrorMessage(t, carOutError);

  return (
    <>
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}

      <ContractTarsInlineStatus
        contractId={contractId}
        operation="handover"
        className={styles.integration}
      />

      <div className={styles.grid}>
        {INSPECTION_ANGLES.map((angle) => {
          const file = photos[angle];
          return (
            <label key={angle} className={styles.slot}>
              <input
                type="file"
                accept={PHOTO_ACCEPT}
                className={styles.file}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  event.target.value = "";
                  if (!selected) return;
                  setPhotos((current) => ({ ...current, [angle]: selected }));
                }}
              />
              <span className={styles.angle}>{t(`carOut.angle.${angle}`)}</span>
              <span className={styles.state}>
                {file ? file.name : t("carOut.addPhoto")}
              </span>
            </label>
          );
        })}
      </div>

      {contractId ? (
        <FormBuilder
          key={contractId}
          fields={fields}
          schema={carOutFormSchema}
          defaultValues={{ mileageOut: 0, fuelOut: "F", notes: "" }}
          submitLabel={t("carOut.submit")}
          submittingLabel={t("common.saving")}
          submitSize="md"
          submitDisabled={carOutPending || !ready}
          secondaryAction={
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          }
          onSubmit={async (values) => {
            const packed = INSPECTION_ANGLES.map((angle) => ({
              angle,
              file: photos[angle]!,
            }));
            const parsed = carOutFormSchema.parse(values);
            const ok = await submitCarOut(
              contractId,
              {
                mileageOut: parsed.mileageOut,
                fuelOut: parsed.fuelOut,
                notes: parsed.notes || undefined,
                photos: packed,
              },
              keyRef.current,
            );
            if (ok) onClose();
          }}
        />
      ) : null}
    </>
  );
}
