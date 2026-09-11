"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Drawer } from "@/shared/components/ui/drawer";
import type { ManualExpenseDetailDto } from "../../types/finance.types";
import {
  expenseCategoryLabel,
  formatVehicleLabel,
} from "../../utils/finance-labels";
import { formatFinanceAed } from "../../utils/format-finance-money";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import styles from "./expense-detail-drawer.module.css";

export interface ExpenseDetailDrawerProps {
  open: boolean;
  detail: ManualExpenseDetailDto | null;
  loading: boolean;
  error: unknown;
  canManage: boolean;
  onClose: () => void;
  onRetry: () => void;
  onVoid: () => void;
  onCorrect: () => void;
}

function Kv({ label, value, ltr }: { label: string; value?: string | null; ltr?: boolean }) {
  if (!value) return null;
  return (
    <div className={styles.kv}>
      <span>{label}</span>
      <b dir={ltr ? "ltr" : undefined}>{value}</b>
    </div>
  );
}

export function ExpenseDetailDrawer({
  open,
  detail,
  loading,
  error,
  canManage,
  onClose,
  onRetry,
  onVoid,
  onCorrect,
}: ExpenseDetailDrawerProps) {
  const t = useTranslations("Finance");
  const format = useFormatter();
  const errorMessage = resolveFinanceErrorMessage(t, error as never);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("expense.detailTitle")}
      closeLabel={t("expense.close")}
      heading={detail ? formatFinanceAed(detail.amount) : undefined}
    >
      {loading ? <p className={styles.loading}>{t("expense.detailLoading")}</p> : null}
      {errorMessage ? (
        <div className={styles.error} role="alert">
          <p>{errorMessage}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {detail ? (
        <div className={styles.body} data-testid="finance-expense-detail">
          <Kv label={t("expense.amount")} value={formatFinanceAed(detail.amount)} ltr />
          <Kv
            label={t("expense.category")}
            value={expenseCategoryLabel(detail.category, t)}
          />
          <Kv
            label={t("expense.date")}
            value={format.dateTime(new Date(detail.recognizedAt), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          />
          <Kv label={t("expense.description")} value={detail.description} />
          <Kv label={t("expense.vehicle")} value={formatVehicleLabel(detail.vehicle)} ltr />
          <Kv label={t("expense.vendor")} value={detail.vendorName} />
          <Kv label={t("expense.receiptNumber")} value={detail.receiptNumber} />
          <Kv label={t("expense.note")} value={detail.note} />
          <Kv
            label={t("expense.attachment")}
            value={detail.attachment?.originalName ?? null}
          />
          <Kv
            label={t("expense.status")}
            value={
              detail.status === "VOID"
                ? t("expense.statusVoid")
                : t("expense.statusActive")
            }
          />
          <Kv
            label={t("expense.createdBy")}
            value={detail.createdBy.name ?? detail.createdBy.email}
          />
          <Kv
            label={t("expense.createdAt")}
            value={format.dateTime(new Date(detail.createdAt), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          />
          {detail.status === "VOID" ? (
            <>
              <Kv label={t("expense.voidReason")} value={detail.voidReason} />
              <Kv
                label={t("expense.voidedBy")}
                value={detail.voidedBy?.name ?? detail.voidedBy?.email ?? null}
              />
              <Kv
                label={t("expense.voidedAt")}
                value={
                  detail.voidedAt
                    ? format.dateTime(new Date(detail.voidedAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : null
                }
              />
            </>
          ) : null}
          {detail.correctionOfExpenseId ? (
            <Kv
              label={t("expense.correctionOf")}
              value={detail.correctionOfExpenseId}
              ltr
            />
          ) : null}

          {canManage && detail.status === "ACTIVE" ? (
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="finance-correct-expense"
                onClick={onCorrect}
              >
                {t("expense.correctAction")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="finance-void-expense"
                onClick={onVoid}
              >
                {t("expense.voidAction")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
