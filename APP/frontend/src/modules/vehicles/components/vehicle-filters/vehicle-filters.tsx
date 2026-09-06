"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
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

const ALL_MODELS = "__all__";

/** One request per keystroke is wasteful — let the term settle first. */
const SEARCH_DEBOUNCE_MS = 350;

export interface VehicleModelOption {
  id: number;
  label: string;
}

export interface VehicleFiltersLabels {
  status: Record<VehicleStatusFilter, string>;
  sort: Record<VehicleSortKey, string>;
  statusGroup: string;
  searchLabel: string;
  searchPlaceholder: string;
  modelLabel: string;
  modelAll: string;
  modelsLoading: string;
  sortLabel: string;
  includeInactive: string;
  clear: string;
  activeCount: string;
}

export interface VehicleFiltersProps {
  filters: VehicleFiltersState;
  activeFilterCount: number;
  models: VehicleModelOption[];
  modelsLoading: boolean;
  /** Already-translated result counter shown at the end of the status row. */
  resultsLabel: string;
  labels: VehicleFiltersLabels;
  onStatusChange: (status: VehicleStatusFilter) => void;
  onSearchChange: (search: string) => void;
  onModelChange: (modelId: number | null) => void;
  onIncludeInactiveChange: (includeInactive: boolean) => void;
  onSortChange: (sort: VehicleSortKey) => void;
  onClear: () => void;
}

/** Fleet toolbar — status chips, search, model, ordering and fleet scope. */
export function VehicleFilters({
  filters,
  activeFilterCount,
  models,
  modelsLoading,
  resultsLabel,
  labels,
  onStatusChange,
  onSearchChange,
  onModelChange,
  onIncludeInactiveChange,
  onSortChange,
  onClear,
}: VehicleFiltersProps) {
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [syncedSearch, setSyncedSearch] = useState(filters.search);

  // The store stays the source of truth: a reset (Clear) must reach the box.
  // Adjusted during render — the documented alternative to a sync effect.
  if (filters.search !== syncedSearch) {
    setSyncedSearch(filters.search);
    setSearchDraft(filters.search);
  }

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(
      () => onSearchChange(searchDraft),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search, onSearchChange]);

  const modelOptions: SelectOption[] = [
    { value: ALL_MODELS, label: labels.modelAll },
    ...models.map((model) => ({ value: String(model.id), label: model.label })),
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
              <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                {labels.clear}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.search}>
          <Input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            className={styles.searchInput}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchLabel}
            data-testid="vehicle-search"
          />
        </div>

        <div className={styles.control}>
          <Select
            variant="ghost"
            size="sm"
            searchable
            options={modelOptions}
            value={filters.modelId === null ? ALL_MODELS : String(filters.modelId)}
            onChange={(value) =>
              onModelChange(value === ALL_MODELS ? null : Number(value))
            }
            placeholder={modelsLoading ? labels.modelsLoading : labels.modelAll}
            disabled={modelsLoading && models.length === 0}
            aria-label={labels.modelLabel}
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

        <label className={styles.toggle}>
          <Switch
            checked={filters.includeInactive}
            onChange={onIncludeInactiveChange}
            label={labels.includeInactive}
          />
          <span>{labels.includeInactive}</span>
        </label>

      </div>
    </section>
  );
}
