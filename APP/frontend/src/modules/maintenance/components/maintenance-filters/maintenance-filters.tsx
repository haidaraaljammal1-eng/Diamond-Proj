"use client";

import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type {
  MaintenanceFiltersState,
  MaintenanceSortKey,
  MaintenanceStatusFilter,
  MaintenanceType,
} from "../../types/maintenance.types";
import {
  MAINTENANCE_SORT_KEYS,
  MAINTENANCE_STATUS_FILTERS,
} from "../../utils/maintenance-filters";
import styles from "./maintenance-filters.module.css";

const ALL_TYPES = "__all__";

const TYPE_KEYS: MaintenanceType[] = [
  "mechanical",
  "electrical",
  "tires",
  "air_conditioning",
  "body",
  "periodic",
  "other",
];

export interface MaintenanceFiltersLabels {
  status: Record<MaintenanceStatusFilter, string>;
  sort: Record<MaintenanceSortKey, string>;
  statusGroup: string;
  searchInputLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  searchClear: string;
  typeLabel: string;
  typeAll: string;
  types: Record<MaintenanceType, string>;
  sortLabel: string;
  clear: string;
  activeCount: string;
}

export interface MaintenanceFiltersProps {
  filters: MaintenanceFiltersState;
  activeFilterCount: number;
  searchLoading: boolean;
  resultsLabel: string;
  labels: MaintenanceFiltersLabels;
  onStatusChange: (status: MaintenanceStatusFilter) => void;
  onSearchSubmit: (search: string) => void;
  onSearchClear: () => void;
  onTypeChange: (type: MaintenanceType | null) => void;
  onSortChange: (sort: MaintenanceSortKey) => void;
  onClear: () => void;
}

export function MaintenanceFilters({
  filters,
  activeFilterCount,
  searchLoading,
  resultsLabel,
  labels,
  onStatusChange,
  onSearchSubmit,
  onSearchClear,
  onTypeChange,
  onSortChange,
  onClear,
}: MaintenanceFiltersProps) {
  const typeOptions: SelectOption[] = [
    { value: ALL_TYPES, label: labels.typeAll },
    ...TYPE_KEYS.map((type) => ({ value: type, label: labels.types[type] })),
  ];

  const sortOptions: SelectOption<MaintenanceSortKey>[] = MAINTENANCE_SORT_KEYS.map(
    (key) => ({ value: key, label: labels.sort[key] }),
  );

  return (
    <div className={styles.toolbar}>
      <div className={styles.statusRow}>
        <div className={styles.chips} role="group" aria-label={labels.statusGroup}>
          {MAINTENANCE_STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              className={[
                styles.chip,
                filters.status === status ? styles.active : "",
              ].join(" ")}
              onClick={() => onStatusChange(status)}
            >
              {labels.status[status]}
            </button>
          ))}
        </div>
        <div className={styles.statusEnd}>
          {activeFilterCount > 0 ? (
            <>
              <span className={styles.badge}>{labels.activeCount}</span>
              <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                {labels.clear}
              </Button>
            </>
          ) : null}
          <p className={styles.results}>{resultsLabel}</p>
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
          />
        </div>
        <div className={styles.control}>
          <Select
            options={typeOptions}
            value={filters.maintenanceType ?? ALL_TYPES}
            onChange={(value) =>
              onTypeChange(value === ALL_TYPES ? null : (value as MaintenanceType))
            }
            placeholder={labels.typeLabel}
            variant="ghost"
            size="sm"
            aria-label={labels.typeLabel}
          />
        </div>
        <div className={styles.control}>
          <Select
            options={sortOptions}
            value={filters.sort}
            onChange={onSortChange}
            placeholder={labels.sortLabel}
            variant="ghost"
            size="sm"
            aria-label={labels.sortLabel}
          />
        </div>
      </div>
    </div>
  );
}
