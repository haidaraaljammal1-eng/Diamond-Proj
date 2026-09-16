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
import { useMaintenanceActions } from "../../hooks/use-maintenance";
import type { MaintenanceOrderDetailDto } from "../../types/maintenance.types";
import {
  isoToDateInput,
  isoToTimeInput,
} from "../../utils/maintenance-datetime";
import { resolveMaintenanceErrorMessage } from "../../utils/resolve-maintenance-error";
import {
  editMaintenanceFormSchema,
  toUpdateMaintenancePayload,
  type EditMaintenanceFormValues,
} from "./edit-maintenance.schema";
import styles from "./edit-maintenance-dialog.module.css";

export interface EditMaintenanceDialogProps {
  order: MaintenanceOrderDetailDto | null;
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

function toFormValues(order: MaintenanceOrderDetailDto): EditMaintenanceFormValues {
  const allowScheduledAt = order.status === "scheduled";
  return {
    issueDescription: order.issueDescription,
    maintenanceType: order.maintenanceType,
    workshopName: order.workshopName ?? "",
    odometerIn: order.odometerIn != null ? String(order.odometerIn) : "",
    expectedDate: isoToDateInput(order.expectedCompletionAt),
    expectedTime: isoToTimeInput(order.expectedCompletionAt),
    cost: order.cost != null ? String(order.cost) : "",
    notes: order.notes ?? "",
    scheduledDate: isoToDateInput(order.scheduledAt),
    scheduledTime: isoToTimeInput(order.scheduledAt),
    allowScheduledAt,
  };
}

export function EditMaintenanceDialog({
  order,
  onClose,
  onSuccess,
}: EditMaintenanceDialogProps) {
  const t = useTranslations("Maintenance");
  const {
    updateOrder,
    isUpdating,
    updateError,
    clearUpdateError,
  } = useMaintenanceActions();

  const form = useForm<EditMaintenanceFormValues>({
    resolver: zodResolver(editMaintenanceFormSchema),
    defaultValues: order ? toFormValues(order) : undefined,
  });

  useEffect(() => {
    if (order) {
      clearUpdateError();
      form.reset(toFormValues(order));
    }
  }, [order, clearUpdateError, form]);

  const typeOptions: SelectOption<(typeof TYPE_KEYS)[number]>[] = TYPE_KEYS.map(
    (key) => ({
      value: key,
      label: t(`type.${key}`),
    }),
  );

  const errorMessage = resolveMaintenanceErrorMessage(t, updateError);
  const allowScheduledAt = order?.status === "scheduled";

  const handleSubmit = async (values: EditMaintenanceFormValues) => {
    if (!order) return;
    const ok = await updateOrder(order.id, toUpdateMaintenancePayload(values));
    if (ok) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <Dialog
      open={order !== null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={t("form.editTitle")}
      description={
        order
          ? `${order.vehicle.displayName} · ${order.vehicle.plateNumber ?? ""}`
          : undefined
      }
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
          <label className={styles.label} htmlFor="edit-issue">
            {t("form.issue")}
            <span className={styles.req}>*</span>
          </label>
          <textarea
            id="edit-issue"
            className={styles.textarea}
            rows={4}
            disabled={isUpdating}
            {...form.register("issueDescription")}
          />
          <FormError message={form.formState.errors.issueDescription?.message} />
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
                disabled={isUpdating}
              />
            )}
          />
        </div>

        {allowScheduledAt ? (
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="edit-sched-date">
                {t("form.scheduledDate")}
              </label>
              <Input
                id="edit-sched-date"
                type="date"
                disabled={isUpdating}
                {...form.register("scheduledDate")}
              />
              <FormError message={form.formState.errors.scheduledDate?.message} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="edit-sched-time">
                {t("form.scheduledTime")}
              </label>
              <Input
                id="edit-sched-time"
                type="time"
                disabled={isUpdating}
                {...form.register("scheduledTime")}
              />
            </div>
          </div>
        ) : null}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="edit-workshop">
            {t("form.workshop")}
          </label>
          <Input
            id="edit-workshop"
            disabled={isUpdating}
            {...form.register("workshopName")}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="edit-odo">
              {t("form.odometer")}
            </label>
            <Input
              id="edit-odo"
              inputMode="numeric"
              className={styles.ltr}
              disabled={isUpdating}
              {...form.register("odometerIn")}
            />
            <FormError message={form.formState.errors.odometerIn?.message} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="edit-cost">
              {t("form.cost")}
            </label>
            <Input
              id="edit-cost"
              inputMode="numeric"
              className={styles.ltr}
              disabled={isUpdating}
              {...form.register("cost")}
            />
            <p className={styles.hint}>{t("form.costHint")}</p>
            <FormError message={form.formState.errors.cost?.message} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="edit-exp-date">
              {t("form.expectedDate")}
            </label>
            <Input
              id="edit-exp-date"
              type="date"
              disabled={isUpdating}
              {...form.register("expectedDate")}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="edit-exp-time">
              {t("form.expectedTime")}
            </label>
            <Input
              id="edit-exp-time"
              type="time"
              disabled={isUpdating}
              {...form.register("expectedTime")}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="edit-notes">
            {t("form.notes")}
          </label>
          <textarea
            id="edit-notes"
            className={styles.textarea}
            rows={3}
            disabled={isUpdating}
            {...form.register("notes")}
          />
        </div>

        <div className={styles.actions}>
          <Button type="submit" size="md" loading={isUpdating}>
            {isUpdating ? t("form.saving") : t("form.save")}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("form.cancel")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
