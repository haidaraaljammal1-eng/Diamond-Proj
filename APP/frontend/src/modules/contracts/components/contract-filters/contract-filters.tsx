"use client";

import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import { DateRangePicker } from "@/shared/components/ui/date-range-picker";
import type { DateRangePickerLabels } from "@/shared/components/ui/date-range-picker";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type {
  ContractFiltersState,
  ContractSortKey,
  ContractStatus,
  ContractStatusFilter,
} from "../../types/contract.types";
import { CONTRACT_SORT_KEYS } from "../../utils/contract-filters";
import { CONTRACT_STATUSES } from "../../constants/inspection";
import styles from "./contract-filters.module.css";

const STATUS_FILTERS: ContractStatusFilter[] = ["all", ...CONTRACT_STATUSES];

export interface ContractFiltersLabels {
  status: Record<ContractStatusFilter, string>;
  sort: Record<ContractSortKey, string>;
  statusGroup: string;
  searchInputLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  searchClear: string;
  sortLabel: string;
  dateRange: DateRangePickerLabels;
  clear: string;
  activeCount: string;
}

export interface ContractFiltersProps {
  filters: ContractFiltersState;
  activeFilterCount: number;
  searchLoading: boolean;
  resultsLabel: string;
  locale: string;
  labels: ContractFiltersLabels;
  onStatusChange: (status: ContractStatusFilter) => void;
  onSearchSubmit: (search: string) => void;
  onSearchClear: () => void;
  onDateRangeApply: (from: string, to: string) => void;
  onDateRangeClear: () => void;
  onSortChange: (sort: ContractSortKey) => void;
  onClear: () => void;
}

export function ContractFilters({
  filters,
  activeFilterCount,
  searchLoading,
  resultsLabel,
  locale,
  labels,
  onStatusChange,
  onSearchSubmit,
  onSearchClear,
  onDateRangeApply,
  onDateRangeClear,
  onSortChange,
  onClear,
}: ContractFiltersProps) {
  const sortOptions: SelectOption[] = CONTRACT_SORT_KEYS.map((key) => ({
    value: key,
    label: labels.sort[key],
  }));

  return (
    <section className={styles.toolbar} data-testid="contract-filters">
      <div className={styles.statusRow}>
        <div className={styles.chips} role="group" aria-label={labels.statusGroup}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={[
                styles.chip,
                filters.status === filter ? styles.active : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onStatusChange(filter)}
              aria-pressed={filters.status === filter}
            >
              {labels.status[filter]}
            </button>
          ))}
        </div>

        <div className={styles.statusEnd}>
          <p className={styles.results} aria-live="polite">
            {resultsLabel}
          </p>
          {activeFilterCount > 0 ? (
            <>
              <span className={styles.badge}>{labels.activeCount}</span>
              <Button type="button" variant="secondary" size="sm" onClick={onClear}>
                {labels.clear}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.search}>
          <DataSearch
            appliedValue={filters.search}
            onSearch={onSearchSubmit}
            onClear={onSearchClear}
            placeholder={labels.searchPlaceholder}
            inputLabel={labels.searchInputLabel}
            searchButtonLabel={labels.searchButton}
            clearButtonLabel={labels.searchClear}
            loading={searchLoading}
            inputTestId="contract-search"
          />
        </div>

        <div className={styles.dateRange}>
          <DateRangePicker
            value={{ from: filters.from, to: filters.to }}
            locale={locale}
            labels={labels.dateRange}
            onApply={(range) => onDateRangeApply(range.from, range.to)}
            onClear={onDateRangeClear}
            disabled={searchLoading}
          />
        </div>

        <div className={styles.control}>
          <Select
            variant="ghost"
            size="sm"
            options={sortOptions}
            value={filters.sort}
            onChange={(value) => onSortChange(value as ContractSortKey)}
            aria-label={labels.sortLabel}
          />
        </div>
      </div>
    </section>
  );
}

export type { ContractStatus };
