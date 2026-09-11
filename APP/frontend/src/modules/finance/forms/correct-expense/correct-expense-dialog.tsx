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
import { FinanceVehiclePicker } from "../../components/finance-vehicle-picker/finance-vehicle-picker";
import { useFinanceExpense } from "../../hooks/use-finance";
import type { ManualExpenseDetailDto } from "../../types/finance.types";
import {
  MANUAL_EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  formatVehicleLabel,
} from "../../utils/finance-labels";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import {
  correctExpenseFormSchema,
  toCreateManualExpensePayload,
  type CorrectExpenseFormValues,
} from "../add-expense/add-expense.schema";
import styles from "../add-expense/add-expense-dialog.module.css";

export interface CorrectExpenseDialogProps {
  open: boolean;
  expense: ManualExpenseDetailDto | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CorrectExpenseDialog({
  open,
  expense,
  onClose,
  onSuccess,
}: CorrectExpenseDialogProps) {
  if (!open) return null;
  return (
    <CorrectExpenseDialogForm
      key={expense?.id ?? "correct"}
      expense={expense}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function CorrectExpenseDialogForm({
  expense,
  onClose,
  onSuccess,
}: Omit<CorrectExpenseDialogProps, "open">) {
  const t = useTranslations("Finance");
  const { correctExpense, isCorrecting, correctError, clearCorrectError } =
    useFinanceExpense();
  const form = useForm<CorrectExpenseFormValues>({
    resolver: zodResolver(correctExpenseFormSchema),
    defaultValues: {
      amount: "",
      category: "VEHICLE_CLEANING",
      recognizedAt: "",
      description: "",
      vehicleId: "",
      vendorName: "",
      receiptNumber: "",
      attachmentId: "",
      note: "",
      voidReason: "",
    },
  });

  useEffect(() => {
    if (!expense) return;
    clearCorrectError();
    form.reset({
      amount: String(expense.amount),
      category: expense.category,
      recognizedAt: expense.recognizedAt.slice(0, 16),
      description: expense.description,
      vehicleId: expense.vehicle ? String(expense.vehicle.id) : "",
      vendorName: expense.vendorName ?? "",
      receiptNumber: expense.receiptNumber ?? "",
      attachmentId: expense.attachment?.id ?? "",
      note: expense.note ?? "",
      voidReason: "",
    });
  }, [expense, clearCorrectError, form]);

  const categoryOptions: SelectOption<string>[] = MANUAL_EXPENSE_CATEGORIES.map(
    (category) => ({
      value: category,
      label: expenseCategoryLabel(category, t),
    }),
  );

  const errorMessage = resolveFinanceErrorMessage(t, correctError);

  const handleSubmit = async (values: CorrectExpenseFormValues) => {
    if (!expense) return;
    const base = toCreateManualExpensePayload(values);
    const ok = await correctExpense(expense.id, {
      ...base,
      voidReason: values.voidReason.trim(),
    });
    if (ok) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t("expense.close")}
      title={t("expense.correctTitle")}
      description={t("expense.correctDescription")}
    >
      {expense?.vehicle ? (
        <p className={styles.fileName}>{formatVehicleLabel(expense.vehicle)}</p>
      ) : null}
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(handleSubmit)(event);
        }}
        noValidate
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-correct-amount">
            {t("expense.amount")}
          </label>
          <div className={styles.amountRow}>
            <span className={styles.currency} dir="ltr">AED</span>
            <Input
              id="finance-correct-amount"
              inputMode="numeric"
              {...form.register("amount")}
              aria-invalid={Boolean(form.formState.errors.amount)}
              aria-describedby="finance-correct-amount-error"
            />
          </div>
          <FormError id="finance-correct-amount-error" message={form.formState.errors.amount?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} id="finance-correct-category-label">
            {t("expense.category")}
          </label>
          <Controller
            name="category"
            control={form.control}
            render={({ field, fieldState }) => (
              <Select
                options={categoryOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                clearable
                invalid={fieldState.invalid}
                aria-label={t("expense.category")}
                aria-describedby="finance-correct-category-error"
              />
            )}
          />
          <FormError id="finance-correct-category-error" message={form.formState.errors.category?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-correct-date">
            {t("expense.date")}
          </label>
          <Input
            id="finance-correct-date"
            type="datetime-local"
            {...form.register("recognizedAt")}
            aria-invalid={Boolean(form.formState.errors.recognizedAt)}
            aria-describedby="finance-correct-date-error"
          />
          <FormError id="finance-correct-date-error" message={form.formState.errors.recognizedAt?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-correct-description">
            {t("expense.description")}
          </label>
          <Input
            id="finance-correct-description"
            {...form.register("description")}
            aria-invalid={Boolean(form.formState.errors.description)}
            aria-describedby="finance-correct-description-error"
          />
          <FormError
            id="finance-correct-description-error"
            message={form.formState.errors.description?.message}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} id="finance-correct-vehicle-label">
            {t("expense.vehicle")}
          </label>
          <Controller
            name="vehicleId"
            control={form.control}
            render={({ field }) => (
              <FinanceVehiclePicker
                open
                value={field.value ?? ""}
                onChange={field.onChange}
                labelledBy="finance-correct-vehicle-label"
              />
            )}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-correct-vendor">
            {t("expense.vendor")}
          </label>
          <Input
            id="finance-correct-vendor"
            {...form.register("vendorName")}
            aria-invalid={Boolean(form.formState.errors.vendorName)}
            aria-describedby="finance-correct-vendor-error"
          />
          <FormError id="finance-correct-vendor-error" message={form.formState.errors.vendorName?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-correct-receipt-number">
            {t("expense.receiptNumber")}
          </label>
          <Input
            id="finance-correct-receipt-number"
            {...form.register("receiptNumber")}
            aria-invalid={Boolean(form.formState.errors.receiptNumber)}
            aria-describedby="finance-correct-receipt-error"
          />
          <FormError
            id="finance-correct-receipt-error"
            message={form.formState.errors.receiptNumber?.message}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-correct-note">
            {t("expense.note")}
          </label>
          <Input
            id="finance-correct-note"
            {...form.register("note")}
            aria-invalid={Boolean(form.formState.errors.note)}
            aria-describedby="finance-correct-note-error"
          />
          <FormError id="finance-correct-note-error" message={form.formState.errors.note?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-correct-void-reason">
            {t("expense.voidReason")}
          </label>
          <Input
            id="finance-correct-void-reason"
            {...form.register("voidReason")}
            aria-invalid={Boolean(form.formState.errors.voidReason)}
            aria-describedby="finance-correct-void-reason-error"
          />
          <FormError
            id="finance-correct-void-reason-error"
            message={form.formState.errors.voidReason?.message}
          />
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("expense.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={isCorrecting}>
            {t("expense.correctConfirm")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
