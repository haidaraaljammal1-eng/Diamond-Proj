"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import { useVehicles } from "../../hooks/use-vehicles";
import { useOperatingCompanies } from "@/modules/operating-companies";
import { resolveVehiclesErrorMessage } from "../../utils/resolve-vehicles-error";
import { addVehicleFields } from "./add-vehicle.fields";
import {
  addVehicleFormSchema,
  type AddVehicleFormValues,
} from "./add-vehicle.schema";
import { toCreateVehiclePayload } from "./add-vehicle.types";
import { VehiclePhotoPicker } from "./vehicle-photo-picker";
import styles from "./add-vehicle-dialog.module.css";

export interface AddVehicleSuccessResult {
  photoUploadFailed?: boolean;
}

export interface AddVehicleDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (result?: AddVehicleSuccessResult) => void;
}

const EMPTY_FORM_VALUES: AddVehicleFormValues = {
  companyId: "",
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
  const tCompany = useTranslations("OperatingCompanies");
  const [photo, setPhoto] = useState<File | null>(null);
  const {
    addVehicle,
    isCreating,
    createError,
    clearCreateError,
  } = useVehicles();
  const { companies, isLoading: companiesLoading } = useOperatingCompanies(open);

  useEffect(() => {
    if (open) clearCreateError();
  }, [open, clearCreateError]);

  const handleClose = () => {
    setPhoto(null);
    onClose();
  };

  const fieldLabels = {
    company: companiesLoading ? tCompany("loading") : tCompany("company"),
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
    const result = await addVehicle(
      toCreateVehiclePayload(values),
      photo ?? undefined,
    );
    if (result.ok) {
      setPhoto(null);
      onSuccess?.(
        result.photoUploadFailed ? { photoUploadFailed: true } : undefined,
      );
      onClose();
    }
  };

  const cancelAction = (
    <Button type="button" variant="secondary" size="md" onClick={handleClose}>
      {t("form.cancel")}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      closeLabel={t("form.close")}
      title={t("form.createTitle")}
      description={t("form.createDescription")}
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <VehiclePhotoPicker
        file={photo}
        onFileChange={(nextFile) => setPhoto(nextFile)}
        disabled={isCreating}
      />

      <FormBuilder<AddVehicleFormValues>
        className={styles.form}
        fields={addVehicleFields(
          fieldLabels,
          companies.map((company) => ({ value: String(company.id), label: company.displayName })),
          companiesLoading,
        )}
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
