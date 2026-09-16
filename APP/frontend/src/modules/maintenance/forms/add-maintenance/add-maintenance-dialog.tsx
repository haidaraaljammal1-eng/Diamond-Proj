"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormError } from "@/shared/components/ui/form-error";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { MaintenanceVehiclePicker } from "../../components/maintenance-vehicle-picker/maintenance-vehicle-picker";
import { useMaintenanceActions } from "../../hooks/use-maintenance";
import { resolveMaintenanceErrorMessage } from "../../utils/resolve-maintenance-error";
import {
  addMaintenanceFormSchema,
  EMPTY_ADD_MAINTENANCE_VALUES,
  toCreateMaintenancePayload,
  type AddMaintenanceFormValues,
} from "./add-maintenance.schema";
import styles from "./add-maintenance-dialog.module.css";

export interface AddMaintenanceDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TYPE_KEYS = [
  "mechanical",
  "electrical",
  "tires",
  "air_conditioning",
  "body",
  "periodic",
  "other",
] as const;

export function AddMaintenanceDialog({
  open,
  onClose,
  onSuccess,
}: AddMaintenanceDialogProps) {
  const t = useTranslations("Maintenance");
  const {
    createOrder,
    isCreating,
    createError,
    clearCreateError,
  } = useMaintenanceActions();

  const form = useForm<AddMaintenanceFormValues>({
    resolver: zodResolver(addMaintenanceFormSchema),
    defaultValues: EMPTY_ADD_MAINTENANCE_VALUES,
  });

  useEffect(() => {
    if (open) {
      clearCreateError();
      form.reset(EMPTY_ADD_MAINTENANCE_VALUES);
    }
  }, [open, clearCreateError, form]);

  const typeOptions: SelectOption<(typeof TYPE_KEYS)[number]>[] = TYPE_KEYS.map(
    (key) => ({
      value: key,
      label: t(`type.${key}`),
    }),
  );

  const errorMessage = resolveMaintenanceErrorMessage(t, createError);

  const handleClose = () => {
    form.reset(EMPTY_ADD_MAINTENANCE_VALUES);
    onClose();
  };

  const handleSubmit = async (values: AddMaintenanceFormValues) => {
    const ok = await createOrder(toCreateMaintenancePayload(values));
    if (ok) {
      form.reset(EMPTY_ADD_MAINTENANCE_VALUES);
      onSuccess?.();
      onClose();
    }
  };

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

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(handleSubmit)(event);
        }}
        noValidate
      >
        <div className={styles.field}>
          <label className={styles.label} id="maint-vehicle-label">
            {t("form.vehicle")}
            <span className={styles.req}>*</span>
          </label>
          <Controller
            name="vehicleId"
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                <MaintenanceVehiclePicker
                  open={open}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isCreating}
                  invalid={fieldState.invalid}
                  labelledBy="maint-vehicle-label"
                  embeddedSearch
                />
                <FormError
                  id="vehicleId-error"
                  message={fieldState.error?.message}
                />
              </>
            )}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="issueDescription">
            {t("form.issue")}
            <span className={styles.req}>*</span>
          </label>
          <textarea
            id="issueDescription"
            className={styles.textarea}
            rows={4}
            placeholder={t("form.issuePlaceholder")}
            aria-invalid={!!form.formState.errors.issueDescription}
            disabled={isCreating}
            {...form.register("issueDescription")}
          />
          <FormError
            id="issueDescription-error"
            message={form.formState.errors.issueDescription?.message}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t("form.type")}</span>
          <Controller
            name="maintenanceType"
            control={form.control}
            render={({ field }) => (
              <Select
                options={typeOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t("form.type")}
                disabled={isCreating}
              />
            )}
          />
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>{t("form.entry")}</legend>
          <Controller
            name="startMode"
            control={form.control}
            render={({ field }) => (
              <>
                <div className={styles.segment} role="radiogroup">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={field.value === "now"}
                    className={[
                      styles.segBtn,
                      field.value === "now" ? styles.segOn : "",
                    ].join(" ")}
                    disabled={isCreating}
                    onClick={() => field.onChange("now")}
                  >
                    {t("form.entryNow")}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={field.value === "scheduled"}
                    className={[
                      styles.segBtn,
                      field.value === "scheduled" ? styles.segOn : "",
                    ].join(" ")}
                    disabled={isCreating}
                    onClick={() => field.onChange("scheduled")}
                  >
                    {t("form.entryScheduled")}
                  </button>
                </div>
                {field.value === "scheduled" ? (
                  <div className={styles.row}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="scheduledDate">
                        {t("form.scheduledDate")}
                        <span className={styles.req}>*</span>
                      </label>
                      <Input
                        id="scheduledDate"
                        type="date"
                        disabled={isCreating}
                        aria-invalid={!!form.formState.errors.scheduledDate}
                        {...form.register("scheduledDate")}
                      />
                      <FormError
                        message={form.formState.errors.scheduledDate?.message}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="scheduledTime">
                        {t("form.scheduledTime")}
                        <span className={styles.req}>*</span>
                      </label>
                      <Input
                        id="scheduledTime"
                        type="time"
                        disabled={isCreating}
                        {...form.register("scheduledTime")}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            )}
          />
        </fieldset>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="workshopName">
            {t("form.workshop")}
          </label>
          <Input
            id="workshopName"
            placeholder={t("form.workshopPlaceholder")}
            disabled={isCreating}
            {...form.register("workshopName")}
          />
          <FormError message={form.formState.errors.workshopName?.message} />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="odometerIn">
              {t("form.odometer")}
            </label>
            <Input
              id="odometerIn"
              inputMode="numeric"
              className={styles.ltr}
              placeholder={t("form.odometerPlaceholder")}
              disabled={isCreating}
              aria-invalid={!!form.formState.errors.odometerIn}
              {...form.register("odometerIn")}
            />
            <FormError message={form.formState.errors.odometerIn?.message} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cost">
              {t("form.cost")}
            </label>
            <Input
              id="cost"
              inputMode="numeric"
              className={styles.ltr}
              placeholder={t("form.costPlaceholder")}
              disabled={isCreating}
              aria-invalid={!!form.formState.errors.cost}
              {...form.register("cost")}
            />
            <p className={styles.hint}>{t("form.costHint")}</p>
            <FormError message={form.formState.errors.cost?.message} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectedDate">
              {t("form.expectedDate")}
            </label>
            <Input
              id="expectedDate"
              type="date"
              disabled={isCreating}
              {...form.register("expectedDate")}
            />
            <FormError message={form.formState.errors.expectedDate?.message} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectedTime">
              {t("form.expectedTime")}
            </label>
            <Input
              id="expectedTime"
              type="time"
              disabled={isCreating}
              {...form.register("expectedTime")}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="notes">
            {t("form.notes")}
          </label>
          <textarea
            id="notes"
            className={styles.textarea}
            rows={3}
            placeholder={t("form.notesPlaceholder")}
            disabled={isCreating}
            {...form.register("notes")}
          />
          <FormError message={form.formState.errors.notes?.message} />
        </div>

        <div className={styles.actions}>
          <Button
            type="submit"
            size="md"
            loading={isCreating}
            disabled={isCreating}
          >
            {isCreating ? t("form.saving") : t("form.submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClose}
          >
            {t("form.cancel")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
