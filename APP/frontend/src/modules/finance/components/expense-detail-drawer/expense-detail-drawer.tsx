"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Drawer } from "@/shared/components/ui/drawer";
import type { ManualExpenseCategory, ManualExpenseDetailDto } from "../../types/finance.types";
import {
  expenseCategoryLabel,
  formatVehicleLabel,
} from "../../utils/finance-labels";
import { formatFinanceAed } from "../../utils/format-finance-money";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import { FinanceClassification } from "../finance-classification/finance-classification";
import styles from "./expense-detail-drawer.module.css";

export interface ExpenseDetailDrawerProps {
  open: boolean;
  detail: ManualExpenseDetailDto | null;
  loading: boolean;
  error: unknown;
  canManage: boolean;
  demoOnly?: boolean;
  onClose: () => void;
  onRetry: () => void;
  onVoid: () => void;
  onCorrect: () => void;
}

function isVehicleSnap(
  value: unknown,
): value is { id: number; vehicleName: string | null; plateNumber: string | null } {
  return typeof value === "object" && value !== null && "id" in value;
}

function formatChangeValue(
  field: string,
  value: unknown,
  t: (key: string) => string,
  format: ReturnType<typeof useFormatter>,
): string {
  if (value == null || value === "") return "—";
  if (field === "amount" && typeof value === "number") return formatFinanceAed(value);
  if (field === "category" && typeof value === "string") {
    return expenseCategoryLabel(value as ManualExpenseCategory, t);
  }
  if (field === "recognizedAt" && typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
  }
  if (field === "vehicle") {
    return isVehicleSnap(value) ? formatVehicleLabel(value) || "—" : "—";
  }
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "—";
}

const CHANGE_FIELD_KEYS: Record<string, string> = {
  amount: "expense.amount",
  category: "expense.category",
  recognizedAt: "expense.date",
  description: "expense.description",
  vehicle: "expense.vehicle",
  vendorName: "expense.vendor",
  receiptNumber: "expense.receiptNumber",
  note: "expense.note",
};

function changeFieldLabel(field: string, t: (key: string) => string): string {
  return t(CHANGE_FIELD_KEYS[field] ?? "expense.description");
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
  demoOnly = false,
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
          {demoOnly ? (
            <p className={styles.demoNote} data-testid="finance-expense-demo-note">
              {t("simulation.demoDetailNote")}
            </p>
          ) : null}
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
          {detail.company !== undefined ? (
            <div className={styles.kv}>
              <span>{t("scope.classification")}</span>
              <FinanceClassification company={detail.company} />
            </div>
          ) : null}
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
              <p className={styles.demoNote}>{t("expense.voidedEffect")}</p>
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

          {(detail.correctionHistory ?? []).length > 0 ? (
            <section className={styles.history} data-testid="finance-correction-history">
              <h3 className={styles.historyTitle}>{t("expense.correctionHistory")}</h3>
              {(detail.correctionHistory ?? []).map((revision) => (
                <article key={revision.id} className={styles.historyItem}>
                  <p className={styles.historyWhen}>
                    {format.dateTime(new Date(revision.changedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p className={styles.historyWho}>
                    {t("expense.correctedBy")}: {revision.changedBy.name ?? revision.changedBy.email}
                  </p>
                  <ul className={styles.historyChanges}>
                    {revision.changes.map((change) => (
                      <li key={`${revision.id}-${change.field}`}>
                        <span className={styles.historyField}>
                          {changeFieldLabel(change.field, t)}
                        </span>
                        <p className={styles.historyValues} dir="auto">
                          {formatChangeValue(change.field, change.before, t, format)}
                          {" → "}
                          {formatChangeValue(change.field, change.after, t, format)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </section>
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
              {demoOnly ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="finance-void-expense"
                  onClick={onVoid}
                >
                  {t("expense.voidAction")}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
