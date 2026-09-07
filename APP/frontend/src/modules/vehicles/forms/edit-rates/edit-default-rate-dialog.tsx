"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import type { FormField } from "@/shared/components/forms/form-builder";
import { useVehicles } from "../../hooks/use-vehicles";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { resolveVehiclesErrorMessage } from "../../utils/resolve-vehicles-error";
import {
  editDefaultRateFormSchema,
  toUpdateRatesPayload,
  type EditDefaultRateFormValues,
} from "./edit-default-rate.schema";
import styles from "./edit-default-rate-dialog.module.css";

export interface EditDefaultRateDialogProps {
  vehicle: VehicleCardDto | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditDefaultRateDialog({
  vehicle,
  onClose,
  onSuccess,
}: EditDefaultRateDialogProps) {
  const t = useTranslations("Vehicles");
  const {
    updateDefaultRates,
    isUpdatingRates,
    updateRatesError,
    clearUpdateRatesError,
  } = useVehicles();

  useEffect(() => {
    if (vehicle) clearUpdateRatesError();
  }, [vehicle, clearUpdateRatesError]);

  const fields = useMemo<FormField<EditDefaultRateFormValues>[]>(
    () => [
      {
        type: "text",
        name: "dailyRate",
        placeholder: t("editRates.dailyRateLabel"),
        colSpan: 1,
      },
      {
        type: "text",
        name: "monthlyRate",
        placeholder: t("editRates.monthlyRateLabel"),
        colSpan: 1,
      },
    ],
    [t],
  );

  const defaultValues = useMemo<EditDefaultRateFormValues>(
    () => ({
      dailyRate: vehicle?.dailyRate != null ? String(vehicle.dailyRate) : "",
      monthlyRate: vehicle?.monthlyRate != null ? String(vehicle.monthlyRate) : "",
    }),
    [vehicle],
  );

  const errorMessage = resolveVehiclesErrorMessage(t, updateRatesError);

  const handleSubmit = async (values: EditDefaultRateFormValues) => {
    if (!vehicle) return;
    const succeeded = await updateDefaultRates(
      vehicle.id,
      toUpdateRatesPayload(values),
    );
    if (succeeded) {
      onSuccess?.();
      onClose();
    }
  };

  if (!vehicle) return null;

  return (
    <Dialog
      open={vehicle != null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={t("editRates.title", { name: vehicle.displayName })}
      description={t("editRates.description")}
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">{errorMessage}</p>
      ) : null}

      <FormBuilder<EditDefaultRateFormValues>
        key={vehicle.id}
        className={styles.form}
        fields={fields}
        schema={editDefaultRateFormSchema}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        submitLabel={t("form.save")}
        submittingLabel={t("form.saving")}
        submitSize="md"
        submitDisabled={isUpdatingRates}
        secondaryAction={
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("form.cancel")}
          </Button>
        }
      />
    </Dialog>
  );
}
