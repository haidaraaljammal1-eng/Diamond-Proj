"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormError } from "@/shared/components/ui/form-error";
import { Input } from "@/shared/components/ui/input";
import { useFinanceExpense } from "../../hooks/use-finance";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import {
  voidExpenseFormSchema,
  type VoidExpenseFormValues,
} from "../add-expense/add-expense.schema";
import styles from "../add-expense/add-expense-dialog.module.css";

export interface VoidExpenseDialogProps {
  open: boolean;
  expenseId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function VoidExpenseDialog({
  open,
  expenseId,
  onClose,
  onSuccess,
}: VoidExpenseDialogProps) {
  if (!open) return null;
  return (
    <VoidExpenseDialogForm
      expenseId={expenseId}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function VoidExpenseDialogForm({
  expenseId,
  onClose,
  onSuccess,
}: Omit<VoidExpenseDialogProps, "open">) {
  const t = useTranslations("Finance");
  const { voidExpense, isVoiding, voidError, clearVoidError } = useFinanceExpense();
  const form = useForm<VoidExpenseFormValues>({
    resolver: zodResolver(voidExpenseFormSchema),
    defaultValues: { voidReason: "" },
  });

  useEffect(() => {
    clearVoidError();
    form.reset({ voidReason: "" });
  }, [clearVoidError, form]);

  const errorMessage = resolveFinanceErrorMessage(t, voidError);

  const handleSubmit = async (values: VoidExpenseFormValues) => {
    if (!expenseId) return;
    const ok = await voidExpense(expenseId, values);
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
      title={t("expense.voidTitle")}
      description={t("expense.voidDescription")}
    >
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
          <label className={styles.label} htmlFor="finance-void-reason">
            {t("expense.voidReason")}
          </label>
          <Input
            id="finance-void-reason"
            {...form.register("voidReason")}
            aria-invalid={Boolean(form.formState.errors.voidReason)}
            aria-describedby="finance-void-reason-error"
          />
          <FormError
            id="finance-void-reason-error"
            message={form.formState.errors.voidReason?.message}
          />
        </div>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("expense.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={isVoiding}>
            {t("expense.voidConfirm")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
