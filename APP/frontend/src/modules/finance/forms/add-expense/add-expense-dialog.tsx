"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { uploadContractAttachment } from "@/modules/contracts/api/contracts.api";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormError } from "@/shared/components/ui/form-error";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { FinanceVehiclePicker } from "../../components/finance-vehicle-picker/finance-vehicle-picker";
import { useFinanceExpense } from "../../hooks/use-finance";
import { MANUAL_EXPENSE_CATEGORIES, expenseCategoryLabel } from "../../utils/finance-labels";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import {
  EMPTY_ADD_EXPENSE_VALUES,
  addExpenseFormSchema,
  toCreateManualExpensePayload,
  type AddExpenseFormValues,
} from "./add-expense.schema";
import styles from "./add-expense-dialog.module.css";

export interface AddExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddExpenseDialog({ open, onClose, onSuccess }: AddExpenseDialogProps) {
  if (!open) return null;
  return <AddExpenseDialogForm onClose={onClose} onSuccess={onSuccess} />;
}

function AddExpenseDialogForm({
  onClose,
  onSuccess,
}: Omit<AddExpenseDialogProps, "open">) {
  const t = useTranslations("Finance");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const {
    createExpense,
    isCreating,
    createError,
    clearCreateError,
  } = useFinanceExpense();

  const form = useForm<AddExpenseFormValues>({
    resolver: zodResolver(addExpenseFormSchema),
    defaultValues: EMPTY_ADD_EXPENSE_VALUES,
  });

  useEffect(() => {
    clearCreateError();
    setUploadError(null);
    setAttachmentName(null);
    form.reset({
      ...EMPTY_ADD_EXPENSE_VALUES,
      recognizedAt: new Date().toISOString().slice(0, 16),
    });
  }, [clearCreateError, form]);

  const categoryOptions: SelectOption<string>[] = MANUAL_EXPENSE_CATEGORIES.map(
    (category) => ({
      value: category,
      label: expenseCategoryLabel(category, t),
    }),
  );

  const errorMessage = resolveFinanceErrorMessage(t, createError);

  const handleClose = () => {
    form.reset(EMPTY_ADD_EXPENSE_VALUES);
    onClose();
  };

  const handleSubmit = async (values: AddExpenseFormValues) => {
    const ok = await createExpense(toCreateManualExpensePayload(values));
    if (ok) {
      onSuccess?.();
      handleClose();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const attachment = await uploadContractAttachment(file);
      form.setValue("attachmentId", attachment.id);
      setAttachmentName(attachment.originalName);
    } catch {
      setUploadError(t("expense.uploadFailed"));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <Dialog
      open
      onClose={handleClose}
      closeLabel={t("expense.close")}
      title={t("expense.addTitle")}
      description={t("expense.addDescription")}
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">{errorMessage}</p>
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
          <label className={styles.label} htmlFor="finance-expense-amount">
            {t("expense.amount")}
            <span className={styles.req}>*</span>
          </label>
          <div className={styles.amountRow}>
            <span className={styles.currency} dir="ltr">AED</span>
            <Input
              id="finance-expense-amount"
              inputMode="numeric"
              {...form.register("amount")}
              aria-invalid={Boolean(form.formState.errors.amount)}
              aria-describedby="finance-expense-amount-error"
            />
          </div>
          <FormError id="finance-expense-amount-error" message={form.formState.errors.amount?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} id="finance-expense-category-label">
            {t("expense.category")}
            <span className={styles.req}>*</span>
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
                aria-describedby="finance-expense-category-error"
              />
            )}
          />
          <FormError id="finance-expense-category-error" message={form.formState.errors.category?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-expense-date">
            {t("expense.date")}
            <span className={styles.req}>*</span>
          </label>
          <Input
            id="finance-expense-date"
            type="datetime-local"
            {...form.register("recognizedAt")}
            aria-invalid={Boolean(form.formState.errors.recognizedAt)}
            aria-describedby="finance-expense-date-error"
          />
          <FormError id="finance-expense-date-error" message={form.formState.errors.recognizedAt?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-expense-description">
            {t("expense.description")}
            <span className={styles.req}>*</span>
          </label>
          <Input
            id="finance-expense-description"
            {...form.register("description")}
            aria-invalid={Boolean(form.formState.errors.description)}
            aria-describedby="finance-expense-description-error"
          />
          <FormError
            id="finance-expense-description-error"
            message={form.formState.errors.description?.message}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} id="finance-expense-vehicle-label">
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
                labelledBy="finance-expense-vehicle-label"
              />
            )}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-expense-vendor">
            {t("expense.vendor")}
          </label>
          <Input
            id="finance-expense-vendor"
            {...form.register("vendorName")}
            aria-invalid={Boolean(form.formState.errors.vendorName)}
            aria-describedby="finance-expense-vendor-error"
          />
          <FormError id="finance-expense-vendor-error" message={form.formState.errors.vendorName?.message} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-expense-receipt-number">
            {t("expense.receiptNumber")}
          </label>
          <Input
            id="finance-expense-receipt-number"
            {...form.register("receiptNumber")}
            aria-invalid={Boolean(form.formState.errors.receiptNumber)}
            aria-describedby="finance-expense-receipt-error"
          />
          <FormError
            id="finance-expense-receipt-error"
            message={form.formState.errors.receiptNumber?.message}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t("expense.attachment")}</label>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(event) => void handleFileChange(event)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? t("expense.uploading") : t("expense.chooseAttachment")}
          </Button>
          {attachmentName ? (
            <p className={styles.fileName}>{attachmentName}</p>
          ) : null}
          {uploadError ? <p className={styles.error}>{uploadError}</p> : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="finance-expense-note">
            {t("expense.note")}
          </label>
          <Input
            id="finance-expense-note"
            {...form.register("note")}
            aria-invalid={Boolean(form.formState.errors.note)}
            aria-describedby="finance-expense-note-error"
          />
          <FormError id="finance-expense-note-error" message={form.formState.errors.note?.message} />
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={handleClose}>
            {t("expense.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={isCreating || uploading}>
            {t("expense.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
