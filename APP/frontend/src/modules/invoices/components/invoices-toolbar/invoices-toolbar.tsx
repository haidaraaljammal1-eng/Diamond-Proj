"use client";

import { useTranslations } from "next-intl";
import { DataSearch } from "@/shared/components/data-search";
import { Button } from "@/shared/components/ui/button";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type { InvoiceTypeFilter, InvoicesListQuery } from "../../types/invoices.types";
import styles from "./invoices-toolbar.module.css";

const TYPE_OPTIONS: InvoiceTypeFilter[] = [
  "ALL",
  "RENTAL",
  "ROAD_LIABILITY",
  "RECONCILIATION",
  "RENEWAL",
];

export interface InvoicesToolbarProps {
  query: InvoicesListQuery;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  onTypeChange: (type: InvoiceTypeFilter) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  resultsLabel: string;
  loading: boolean;
}

export function InvoicesToolbar({
  query,
  onSearch,
  onClearSearch,
  onTypeChange,
  onDateFrom,
  onDateTo,
  onClearFilters,
  activeFilterCount,
  resultsLabel,
  loading,
}: InvoicesToolbarProps) {
  const t = useTranslations("Invoices");

  const typeSelectOptions: SelectOption<string>[] = TYPE_OPTIONS.map((type) => ({
    value: type,
    label: t(`filters.typeOptions.${type}`),
  }));

  return (
    <div className={styles.toolbar} data-testid="invoices-toolbar">
      <div className={styles.row}>
        <DataSearch
          appliedValue={query.search}
          onSearch={onSearch}
          onClear={onClearSearch}
          placeholder={t("search.placeholder")}
          inputLabel={t("search.inputLabel")}
          searchButtonLabel={t("search.button")}
          clearButtonLabel={t("search.clear")}
          loading={loading}
          inputTestId="invoices-search"
          embedded
        />
        <div className={styles.filters}>
          <span data-testid="invoices-type-filter">
            <Select
              variant="ghost"
              size="sm"
              options={typeSelectOptions}
              value={query.invoiceType}
              onChange={(next) => onTypeChange(next as InvoiceTypeFilter)}
              aria-label={t("filters.type")}
            />
          </span>
          <label className={styles.dateField}>
            <span className={styles.dateLabel}>{t("filters.dateFrom")}</span>
            <input
              type="date"
              className={styles.dateInput}
              value={query.dateFrom}
              onChange={(event) => onDateFrom(event.target.value)}
              data-testid="invoices-date-from"
            />
          </label>
          <label className={styles.dateField}>
            <span className={styles.dateLabel}>{t("filters.dateTo")}</span>
            <input
              type="date"
              className={styles.dateInput}
              value={query.dateTo}
              onChange={(event) => onDateTo(event.target.value)}
              data-testid="invoices-date-to"
            />
          </label>
          {activeFilterCount > 0 ? (
            <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
              {t("filters.clear")}
            </Button>
          ) : null}
        </div>
      </div>
      <p className={styles.meta} data-testid="invoices-results-label">
        {resultsLabel}
      </p>
    </div>
  );
}
