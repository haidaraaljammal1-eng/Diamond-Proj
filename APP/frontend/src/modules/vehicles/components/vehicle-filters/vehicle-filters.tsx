"use client";

import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type {
  VehicleFiltersState,
  VehicleSortKey,
  VehicleStatusFilter,
} from "../../types/vehicle.types";
import { VEHICLE_SORT_KEYS } from "../../utils/vehicle-filters";
import styles from "./vehicle-filters.module.css";

const STATUS_FILTERS: VehicleStatusFilter[] = [
  "all",
  "available",
  "rented",
  "service",
];

const ALL_TYPES = "__all__";

export interface FleetVehicleTypeOption {
  value: string;
  label: string;
}

export interface VehicleFiltersLabels {
  status: Record<VehicleStatusFilter, string>;
  sort: Record<VehicleSortKey, string>;
  statusGroup: string;
  searchInputLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  searchClear: string;
  typeLabel: string;
  typeAll: string;
  typesLoading: string;
  sortLabel: string;
  clear: string;
  activeCount: string;
}

export interface VehicleFiltersProps {
  filters: VehicleFiltersState;
  activeFilterCount: number;
  types: FleetVehicleTypeOption[];
  typesLoading: boolean;
  searchLoading: boolean;
  /** Already-translated result counter shown at the end of the status row. */
  resultsLabel: string;
  labels: VehicleFiltersLabels;
  onStatusChange: (status: VehicleStatusFilter) => void;
  onSearchSubmit: (search: string) => void;
  onSearchClear: () => void;
  onTypeChange: (vehicleType: string | null) => void;
  onSortChange: (sort: VehicleSortKey) => void;
  onClear: () => void;
}

/** Fleet toolbar — status chips, search, vehicle type, ordering. */
export function VehicleFilters({
  filters,
  activeFilterCount,
  types,
  typesLoading,
  searchLoading,
  resultsLabel,
  labels,
  onStatusChange,
  onSearchSubmit,
  onSearchClear,
  onTypeChange,
  onSortChange,
  onClear,
}: VehicleFiltersProps) {
  const typeOptions: SelectOption[] = [
    { value: ALL_TYPES, label: labels.typeAll },
    ...types.map((type) => ({ value: type.value, label: type.label })),
  ];

  const sortOptions: SelectOption[] = VEHICLE_SORT_KEYS.map((key) => ({
    value: key,
    label: labels.sort[key],
  }));

  return (
    <section className={styles.toolbar} data-testid="vehicle-filters">
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
            inputTestId="vehicle-search"
          />
        </div>

        <div className={styles.control}>
          <Select
            variant="ghost"
            size="sm"
            searchable
            options={typeOptions}
            value={filters.vehicleType ?? ALL_TYPES}
            onChange={(value) =>
              onTypeChange(value === ALL_TYPES ? null : value)
            }
            placeholder={typesLoading ? labels.typesLoading : labels.typeAll}
            disabled={typesLoading && types.length === 0}
            aria-label={labels.typeLabel}
          />
        </div>

        <div className={styles.control}>
          <Select
            variant="ghost"
            size="sm"
            options={sortOptions}
            value={filters.sort}
            onChange={(value) => onSortChange(value as VehicleSortKey)}
            aria-label={labels.sortLabel}
          />
        </div>
      </div>
    </section>
  );
}
