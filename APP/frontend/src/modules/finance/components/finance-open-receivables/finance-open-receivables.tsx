"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type { PageMeta } from "../../api/finance.api.types";
import type {
  OpenReceivableDto,
  OpenReceivableSourceType,
  ReceivableSortKey,
} from "../../types/finance.types";
import { formatObligationAge } from "../../utils/finance-age";
import {
  formatVehicleLabel,
  receivablePaymentStateLabel,
  receivableSourceLabel,
} from "../../utils/finance-labels";
import { isSimulatedFinanceId } from "../../utils/finance-simulation";
import { formatFinanceAed } from "../../utils/format-finance-money";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import { FinanceClassification } from "../finance-classification/finance-classification";
import styles from "./finance-open-receivables.module.css";

export interface FinanceOpenReceivablesProps {
  items: OpenReceivableDto[];
  meta: PageMeta | null;
  search: string;
  sourceType: OpenReceivableSourceType | null;
  sort: string;
  loading: boolean;
  error: unknown;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  onSourceTypeChange: (value: OpenReceivableSourceType | null) => void;
  onSortChange: (value: ReceivableSortKey) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onViewContract: (contractId: string) => void;
}

const SOURCE_OPTIONS: Array<OpenReceivableSourceType | "ALL"> = [
  "ALL",
  "RENTAL",
  "RENEWAL",
  "RECONCILIATION",
  "POST_CLOSE_RECEIVABLE",
];

const SORT_OPTIONS: ReceivableSortKey[] = [
  "obligationCreatedAt:desc",
  "obligationCreatedAt:asc",
  "amount:desc",
  "amount:asc",
];

export function FinanceOpenReceivables({
  items,
  meta,
  search,
  sourceType,
  sort,
  loading,
  error,
  onSearch,
  onClearSearch,
  onSourceTypeChange,
  onSortChange,
  onPageChange,
  onRetry,
  onViewContract,
}: FinanceOpenReceivablesProps) {
  const t = useTranslations("Finance");
  const format = useFormatter();
  const errorMessage = resolveFinanceErrorMessage(t, error as never);

  const sourceSelectOptions: SelectOption<string>[] = SOURCE_OPTIONS.map((value) => ({
    value,
    label: value === "ALL" ? t("receivables.sourceAll") : receivableSourceLabel(value, t),
  }));

  const sortSelectOptions: SelectOption<ReceivableSortKey>[] = SORT_OPTIONS.map((value) => ({
    value,
    label: t(`receivables.sort.${value}`),
  }));

  return (
    <section className={styles.section} data-testid="finance-open-receivables">
      <header className={styles.header}>
        <h2 className={styles.title}>{t("receivables.title")}</h2>
        <p className={styles.subtitle}>{t("receivables.subtitle")}</p>
      </header>

      <div className={styles.toolbar}>
        <DataSearch
          appliedValue={search}
          onSearch={onSearch}
          onClear={onClearSearch}
          placeholder={t("receivables.searchPlaceholder")}
          inputLabel={t("receivables.searchLabel")}
          searchButtonLabel={t("search")}
          clearButtonLabel={t("clear")}
          loading={loading}
          inputTestId="finance-receivables-search"
        />
        <Select
          variant="ghost"
          size="sm"
          options={sourceSelectOptions}
          value={sourceType ?? "ALL"}
          onChange={(value) =>
            onSourceTypeChange(value === "ALL" ? null : (value as OpenReceivableSourceType))
          }
          aria-label={t("receivables.sourceLabel")}
        />
        <Select
          variant="ghost"
          size="sm"
          options={sortSelectOptions}
          value={sort as ReceivableSortKey}
          onChange={(value) => onSortChange(value as ReceivableSortKey)}
          aria-label={t("receivables.sortLabel")}
        />
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
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={styles.skeletonRow} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className={styles.empty} data-testid="finance-receivables-empty">
            {t("receivables.empty")}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("receivables.columns.source")}</th>
                <th>{t("receivables.columns.contract")}</th>
                <th className={styles.hideMd}>{t("receivables.columns.customer")}</th>
                <th className={styles.hideMd}>{t("receivables.columns.vehicle")}</th>
                <th>{t("receivables.columns.since")}</th>
                <th className={styles.hideMd}>{t("receivables.columns.age")}</th>
                <th className={styles.hideMd}>{t("receivables.columns.state")}</th>
                <th>{t("receivables.columns.amount")}</th>
                <th>{t("receivables.columns.action")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={`${row.sourceType}-${row.sourceId}`}
                  data-testid="finance-receivable-row"
                  data-source={row.sourceType}
                >
                  <td>{receivableSourceLabel(row.sourceType, t)}</td>
                  <td>
                    <div dir="ltr">{row.contractNumber}</div>
                    <FinanceClassification company={row.company} />
                  </td>
                  <td className={styles.hideMd}>{row.customer?.name ?? "—"}</td>
                  <td className={styles.hideMd}>{formatVehicleLabel(row.vehicle) ?? "—"}</td>
                  <td>
                    {format.dateTime(new Date(row.obligationCreatedAt), {
                      dateStyle: "medium",
                    })}
                  </td>
                  <td className={styles.hideMd}>
                    {formatObligationAge(row.obligationCreatedAt, new Date(), t)}
                  </td>
                  <td
                    className={styles.hideMd}
                    data-testid="finance-receivable-payment-state"
                  >
                    {receivablePaymentStateLabel(row.paymentState, t)}
                  </td>
                  <td className={styles.amount} dir="ltr">
                    {formatFinanceAed(row.outstandingAmount)}
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isSimulatedFinanceId(row.contractId)}
                      title={
                        isSimulatedFinanceId(row.contractId)
                          ? t("simulation.viewDisabled")
                          : undefined
                      }
                      onClick={() => onViewContract(row.contractId)}
                    >
                      {t("receivables.view")}
                    </Button>
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
