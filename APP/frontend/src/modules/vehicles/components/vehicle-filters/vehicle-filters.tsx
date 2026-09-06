"use client";

import type { VehicleStatusFilter } from "../../types/vehicle.types";
import styles from "./vehicle-filters.module.css";

const FILTERS: VehicleStatusFilter[] = [
  "all",
  "available",
  "rented",
  "service",
];

export interface VehicleFiltersProps {
  value: VehicleStatusFilter;
  onChange: (value: VehicleStatusFilter) => void;
  labels: Record<VehicleStatusFilter, string>;
}

export function VehicleFilters({ value, onChange, labels }: VehicleFiltersProps) {
  return (
    <div className={styles.filters} data-testid="vehicle-filters">
      {FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          className={[styles.chip, value === filter ? styles.active : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onChange(filter)}
          aria-pressed={value === filter}
        >
          {labels[filter]}
        </button>
      ))}
    </div>
  );
}
