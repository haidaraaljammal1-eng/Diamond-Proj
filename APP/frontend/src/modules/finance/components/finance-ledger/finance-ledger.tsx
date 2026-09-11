"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type { PageMeta } from "../../api/finance.api.types";
import type {
  LedgerDirection,
  LedgerEntryDto,
  LedgerKind,
  LedgerSourceType,
} from "../../types/finance.types";
import {
  formatVehicleLabel,
  ledgerKindLabel,
  ledgerMovementLabel,
} from "../../utils/finance-labels";
import { formatSignedFinanceAed } from "../../utils/format-finance-money";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import styles from "./finance-ledger.module.css";

export interface FinanceLedgerProps {
  items: LedgerEntryDto[];
  meta: PageMeta | null;
  search: string;
  direction: LedgerDirection | null;
  kind: LedgerKind | null;
  loading: boolean;
  error: unknown;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  onDirectionChange: (value: LedgerDirection | null) => void;
  onKindChange: (value: LedgerKind | null) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onViewContract: (contractId: string) => void;
  onViewExpense: (expenseId: string) => void;
}

const DIRECTION_OPTIONS: Array<LedgerDirection | "ALL"> = [
  "ALL",
  "COLLECTION",
  "EXPENSE",
  "EXPENSE_REVERSAL",
];

export function FinanceLedger({
  items,
  meta,
  search,
  direction,
  kind,
  loading,
  error,
  onSearch,
  onClearSearch,
  onDirectionChange,
  onKindChange,
  onClearFilters,
  onPageChange,
  onRetry,
  onViewContract,
  onViewExpense,
}: FinanceLedgerProps) {
  const t = useTranslations("Finance");
  const format = useFormatter();
  const errorMessage = resolveFinanceErrorMessage(t, error as never);

  const directionOptions: SelectOption<string>[] = DIRECTION_OPTIONS.map((value) => ({
    value,
    label:
      value === "ALL"
        ? t("ledger.directionAll")
        : ledgerMovementLabel(value, t),
  }));

  const kindOptions: SelectOption<string>[] = [
    { value: "ALL", label: t("ledger.kindAll") },
    ...[
      "RENTAL_PAYMENT",
      "RENEWAL_PAYMENT",
      "RECONCILIATION_PAYMENT",
      "POST_CLOSE_RECEIVABLE_PAYMENT",
      "MAINTENANCE_EXPENSE",
      "MANUAL_EXPENSE",
      "MANUAL_EXPENSE_REVERSAL",
    ].map((value) => ({
      value,
      label: ledgerKindLabel(value, t),
    })),
  ];

  const amountClass = (entry: LedgerEntryDto) => {
    if (entry.direction === "EXPENSE") return styles.amountExpense;
    if (entry.direction === "EXPENSE_REVERSAL") return styles.amountReversal;
    return styles.amountCollection;
  };

  const referenceLabel = (entry: LedgerEntryDto) => {
    if (entry.description) return entry.description;
    return ledgerKindLabel(entry.kind, t);
  };

  const contractVehicleLabel = (entry: LedgerEntryDto) => {
    const contract = entry.contract?.contractNumber;
    const vehicle = formatVehicleLabel(entry.vehicle);
    if (contract && vehicle) return `${contract} · ${vehicle}`;
    return contract ?? vehicle ?? "—";
  };

  return (
    <section className={styles.section} data-testid="finance-ledger">
      <header className={styles.header}>
        <h2 className={styles.title}>{t("ledger.title")}</h2>
        <p className={styles.subtitle}>{t("ledger.subtitle")}</p>
      </header>

      <div className={styles.toolbar}>
        <DataSearch
          appliedValue={search}
          onSearch={onSearch}
          onClear={onClearSearch}
          placeholder={t("ledger.searchPlaceholder")}
          inputLabel={t("ledger.searchLabel")}
          searchButtonLabel={t("search")}
          clearButtonLabel={t("clear")}
          loading={loading}
          inputTestId="finance-ledger-search"
        />
        <Select
          variant="ghost"
          size="sm"
          options={directionOptions}
          value={direction ?? "ALL"}
          onChange={(value) =>
            onDirectionChange(value === "ALL" ? null : (value as LedgerDirection))
          }
          aria-label={t("ledger.directionLabel")}
        />
        <Select
          variant="ghost"
          size="sm"
          options={kindOptions}
          value={kind ?? "ALL"}
          onChange={(value) =>
            onKindChange(value === "ALL" ? null : (value as LedgerKind))
          }
          aria-label={t("ledger.kindLabel")}
        />
        <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
          {t("clearFilters")}
        </Button>
      </div>

      {errorMessage ? (
        <div className={styles.error} role="alert">
          <p>{errorMessage}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        {loading && items.length === 0 ? (
          <div aria-busy="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={styles.skeletonRow} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className={styles.empty} data-testid="finance-ledger-empty">
            {t("ledger.empty")}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("ledger.columns.date")}</th>
                <th>{t("ledger.columns.movement")}</th>
                <th>{t("ledger.columns.source")}</th>
                <th>{t("ledger.columns.reference")}</th>
                <th className={styles.hideMd}>{t("ledger.columns.contractVehicle")}</th>
                <th>{t("ledger.columns.amount")}</th>
                <th>{t("ledger.columns.action")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} data-testid="finance-ledger-row">
                  <td>
                    {format.dateTime(new Date(entry.occurredAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td>{ledgerMovementLabel(entry.direction, t)}</td>
                  <td>{ledgerKindLabel(entry.kind, t)}</td>
                  <td>{referenceLabel(entry)}</td>
                  <td className={styles.hideMd} dir="ltr">{contractVehicleLabel(entry)}</td>
                  <td className={amountClass(entry)} dir="ltr">
                    {formatSignedFinanceAed(entry.amount, entry.direction)}
                  </td>
                  <td>
                    {entry.manualExpenseId ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        data-testid="finance-view-expense"
                        onClick={() => onViewExpense(entry.manualExpenseId!)}
                      >
                        {t("ledger.view")}
                      </Button>
                    ) : entry.contract?.id ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onViewContract(entry.contract!.id)}
                      >
                        {t("ledger.view")}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className={styles.pagination}>
          <span>{t("pagination.results", { count: meta.total })}</span>
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              {t("pagination.prev")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
            >
              {t("pagination.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
