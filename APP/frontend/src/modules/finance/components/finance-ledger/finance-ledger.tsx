"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type { PageMeta } from "../../api/finance.api.types";
import type {
  LedgerDisplaySource,
  LedgerEntryDto,
  LedgerMovementFilter,
} from "../../types/finance.types";
import {
  formatVehicleLabel,
  LEDGER_DISPLAY_SOURCES,
  isVoidedOriginalExpenseRow,
  ledgerMovementLabel,
  ledgerRowMovementKey,
  ledgerRowMovementLabel,
  ledgerSourceFromKind,
  ledgerSourceLabel,
} from "../../utils/finance-labels";
import { isSimulatedFinanceId } from "../../utils/finance-simulation";
import { formatOperationalLedgerAmount } from "../../utils/format-finance-money";
import { FinanceClassification } from "../finance-classification/finance-classification";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import styles from "./finance-ledger.module.css";

export interface FinanceLedgerProps {
  items: LedgerEntryDto[];
  meta: PageMeta | null;
  search: string;
  direction: LedgerMovementFilter | null;
  displaySource: LedgerDisplaySource | null;
  loading: boolean;
  error: unknown;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  onDirectionChange: (value: LedgerMovementFilter | null) => void;
  onSourceChange: (value: LedgerDisplaySource | null) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onViewContract: (contractId: string) => void;
  onViewExpense: (expenseId: string) => void;
}

const DIRECTION_OPTIONS: Array<LedgerMovementFilter | "ALL"> = [
  "ALL",
  "COLLECTION",
  "EXPENSE",
  "VOIDED",
];

export function FinanceLedger({
  items,
  meta,
  search,
  direction,
  displaySource,
  loading,
  error,
  onSearch,
  onClearSearch,
  onDirectionChange,
  onSourceChange,
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
        ? t("ledger.movementAll")
        : ledgerMovementLabel(value, t),
  }));

  const sourceOptions: SelectOption<string>[] = [
    { value: "ALL", label: t("ledger.sourceAll") },
    ...LEDGER_DISPLAY_SOURCES.map((value) => ({
      value,
      label: ledgerSourceLabel(value, t),
    })),
  ];

  const amountClass = (entry: LedgerEntryDto) => {
    if (isVoidedOriginalExpenseRow(entry)) return styles.amountVoided;
    if (entry.direction === "EXPENSE") return styles.amountExpense;
    if (entry.direction === "EXPENSE_REVERSAL") return styles.amountVoided;
    return styles.amountCollection;
  };

  const movementClass = (entry: LedgerEntryDto) => {
    if (isVoidedOriginalExpenseRow(entry)) return styles.movementVoided;
    if (entry.direction === "EXPENSE") return styles.movementExpense;
    if (entry.direction === "EXPENSE_REVERSAL") return styles.movementVoided;
    return styles.movementCollection;
  };

  const referenceLabel = (entry: LedgerEntryDto) => {
    const description = entry.description?.trim();
    const reference = entry.reference?.trim();
    if (description && reference && entry.direction === "EXPENSE_REVERSAL") {
      return `${description} · ${reference}`;
    }
    if (description) return description;
    const source = ledgerSourceFromKind(entry.kind);
    return source ? ledgerSourceLabel(source, t) : entry.kind;
  };

  const contractVehicleLabel = (entry: LedgerEntryDto) => {
    const contract = entry.contract?.contractNumber;
    const vehicle = formatVehicleLabel(entry.vehicle);
    if (contract && vehicle) return `${contract} · ${vehicle}`;
    return contract ?? vehicle ?? "—";
  };

  const sourceOf = (entry: LedgerEntryDto) => ledgerSourceFromKind(entry.kind);

  const renderAction = (entry: LedgerEntryDto) => {
    if (entry.manualExpenseId) {
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="finance-view-expense"
          onClick={() => onViewExpense(entry.manualExpenseId!)}
        >
          {t("ledger.view")}
        </Button>
      );
    }
    if (entry.contract?.id && !isSimulatedFinanceId(entry.contract.id)) {
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onViewContract(entry.contract!.id)}
        >
          {t("ledger.view")}
        </Button>
      );
    }
    if (entry.contract?.id) {
      return (
        <Button type="button" variant="secondary" size="sm" disabled title={t("simulation.viewDisabled")}>
          {t("ledger.view")}
        </Button>
      );
    }
    return "—";
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
            onDirectionChange(value === "ALL" ? null : (value as LedgerMovementFilter))
          }
          aria-label={t("ledger.movementLabel")}
        />
        <Select
          variant="ghost"
          size="sm"
          options={sourceOptions}
          value={displaySource ?? "ALL"}
          onChange={(value) =>
            onSourceChange(value === "ALL" ? null : (value as LedgerDisplaySource))
          }
          aria-label={t("ledger.sourceLabel")}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="finance-ledger-clear"
          onClick={onClearFilters}
        >
          {t("clear")}
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

      {meta ? (
        <p className={styles.count} data-testid="finance-ledger-count">
          {t("ledger.movementCount", { count: meta.total })}
        </p>
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
          <>
            <table className={styles.table}>
              <colgroup>
                <col className={styles.colDate} />
                <col className={styles.colMovement} />
                <col className={styles.colSource} />
                <col className={styles.colReference} />
                <col className={`${styles.colContract} ${styles.hideMd}`} />
                <col className={styles.colAmount} />
                <col className={styles.colAction} />
              </colgroup>
              <thead>
                <tr>
                  <th className={styles.colDate}>{t("ledger.columns.date")}</th>
                  <th className={styles.colMovement}>{t("ledger.columns.movement")}</th>
                  <th className={styles.colSource}>{t("ledger.columns.source")}</th>
                  <th className={styles.colReference}>{t("ledger.columns.reference")}</th>
                  <th className={`${styles.colContract} ${styles.hideMd}`}>
                    {t("ledger.columns.contractVehicle")}
                  </th>
                  <th className={`${styles.colAmount} ${styles.amountCell}`}>
                    {t("ledger.columns.amount")}
                  </th>
                  <th className={`${styles.colAction} ${styles.actionCell}`}>
                    {t("ledger.columns.action")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => {
                  const source = sourceOf(entry);
                  return (
                    <tr
                      key={entry.id}
                      data-testid="finance-ledger-row"
                      data-movement={ledgerRowMovementKey(entry)}
                      data-source={source ?? ""}
                      data-kind={entry.kind}
                    >
                      <td className={`${styles.colDate} ${styles.cellClip}`}>
                        {format.dateTime(new Date(entry.occurredAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className={styles.colMovement}>
                        <span className={movementClass(entry)} data-testid="finance-ledger-movement">
                          {ledgerRowMovementLabel(entry, t)}
                        </span>
                      </td>
                      <td className={`${styles.colSource} ${styles.cellClip}`} data-testid="finance-ledger-source">
                        {source ? ledgerSourceLabel(source, t) : entry.kind}
                      </td>
                      <td className={`${styles.colReference} ${styles.cellClip}`}>
                        <span className={styles.referenceText}>{referenceLabel(entry)}</span>
                        <span className={styles.classification}>
                          <FinanceClassification company={entry.company} />
                        </span>
                      </td>
                      <td className={`${styles.colContract} ${styles.hideMd} ${styles.cellClip}`} dir="ltr">
                        {contractVehicleLabel(entry)}
                      </td>
                      <td
                        className={`${styles.colAmount} ${styles.amountCell} ${amountClass(entry)}`}
                        dir="ltr"
                        data-testid="finance-ledger-amount"
                      >
                        {formatOperationalLedgerAmount(entry.amount, entry)}
                      </td>
                      <td className={`${styles.colAction} ${styles.actionCell}`}>{renderAction(entry)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className={styles.cards}>
              {items.map((entry) => {
                const source = sourceOf(entry);
                return (
                  <article
                    key={`card-${entry.id}`}
                    className={styles.card}
                    data-testid="finance-ledger-card"
                    data-movement={ledgerRowMovementKey(entry)}
                    data-source={source ?? ""}
                    data-kind={entry.kind}
                  >
                    <div className={styles.cardDate}>
                      {format.dateTime(new Date(entry.occurredAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={movementClass(entry)} data-testid="finance-ledger-movement">
                        {ledgerRowMovementLabel(entry, t)}
                      </span>
                      <span data-testid="finance-ledger-source">
                        {source ? ledgerSourceLabel(source, t) : entry.kind}
                      </span>
                    </div>
                    <div>{referenceLabel(entry)}</div>
                    <div className={amountClass(entry)} dir="ltr" data-testid="finance-ledger-amount">
                      {formatOperationalLedgerAmount(entry.amount, entry)}
                    </div>
                    <div>{renderAction(entry)}</div>
                  </article>
                );
              })}
            </div>
          </>
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
