"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import { useVehicles } from "../../hooks/use-vehicles";
import { resolveVehiclesErrorMessage } from "../../utils/resolve-vehicles-error";
import { addVehicleFields } from "./add-vehicle.fields";
import {
  addVehicleFormSchema,
  type AddVehicleFormValues,
} from "./add-vehicle.schema";
import { toCreateVehiclePayload } from "./add-vehicle.types";
import styles from "./add-vehicle-dialog.module.css";

export interface AddVehicleDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const EMPTY_FORM_VALUES: AddVehicleFormValues = {
  vehicleName: "",
  modelYear: "",
  plateNumber: "",
  color: "",
  dailyRate: "",
  monthlyRate: "",
  vin: "",
};

export function AddVehicleDialog({ open, onClose, onSuccess }: AddVehicleDialogProps) {
  const t = useTranslations("Vehicles");
  const {
    addVehicle,
    isCreating,
    createError,
    clearCreateError,
  } = useVehicles();

  useEffect(() => {
    if (open) clearCreateError();
  }, [open, clearCreateError]);

  const fieldLabels = {
    vehicleName: t("form.vehicleNameLabel"),
    vehicleNamePlaceholder: t("form.vehicleNamePlaceholder"),
    modelYear: t("form.modelYearLabel"),
    plateNumber: t("form.plateNumberLabel"),
    color: t("form.colorLabel"),
    dailyRate: t("form.dailyRateLabel"),
    monthlyRate: t("form.monthlyRateLabel"),
    vin: t("form.vinLabel"),
  };

  const errorMessage = resolveVehiclesErrorMessage(t, createError);

  const handleSubmit = async (values: AddVehicleFormValues) => {
    const succeeded = await addVehicle(toCreateVehiclePayload(values));
    if (succeeded) {
      onSuccess?.();
      onClose();
    }
  };

  const cancelAction = (
    <Button type="button" variant="ghost" size="md" onClick={onClose}>
      {t("form.cancel")}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={t("form.createTitle")}
      description={t("form.createDescription")}
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <FormBuilder<AddVehicleFormValues>
        key={open ? "open" : "closed"}
        className={styles.form}
        fields={addVehicleFields(fieldLabels)}
        schema={addVehicleFormSchema}
        defaultValues={EMPTY_FORM_VALUES}
        onSubmit={handleSubmit}
        submitLabel={t("form.save")}
        submittingLabel={t("form.saving")}
        submitSize="md"
        submitDisabled={isCreating}
        secondaryAction={cancelAction}
      />
    </Dialog>
  );
}
