"use client";

import { useTranslations } from "next-intl";
import { DataSearch } from "@/shared/components/data-search";
import { useFinanceVehicleSearch } from "../../hooks/use-finance-vehicle-search";
import styles from "./finance-vehicle-picker.module.css";

export interface FinanceVehiclePickerProps {
  open: boolean;
  value: string;
  onChange: (vehicleId: string) => void;
  invalid?: boolean;
  labelledBy?: string;
}

export function FinanceVehiclePicker({
  open,
  value,
  onChange,
  invalid,
  labelledBy,
}: FinanceVehiclePickerProps) {
  const t = useTranslations("Finance");
  const { vehicles, isLoading, search, applySearch, clearSearch } =
    useFinanceVehicleSearch(open);

  const selected = vehicles.find((vehicle) => String(vehicle.id) === value);

  return (
    <div className={styles.root}>
      <DataSearch
        appliedValue={search}
        onSearch={applySearch}
        onClear={clearSearch}
        placeholder={t("expense.vehicleSearchPlaceholder")}
        inputLabel={t("expense.vehicleSearchLabel")}
        searchButtonLabel={t("search")}
        clearButtonLabel={t("clear")}
        loading={isLoading}
        embedded
      />

      {selected ? (
        <p className={styles.selected}>
          <span>{selected.displayName}</span>
          {selected.plateNumber ? (
            <span dir="ltr">{selected.plateNumber}</span>
          ) : null}
        </p>
      ) : null}

      <div
        className={styles.list}
        role="listbox"
        aria-labelledby={labelledBy}
        aria-invalid={invalid || undefined}
      >
        {isLoading ? (
          <p className={styles.empty}>{t("expense.vehicleLoading")}</p>
        ) : vehicles.length === 0 ? (
          <p className={styles.empty}>{t("expense.vehicleEmpty")}</p>
        ) : (
          vehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              role="option"
              aria-selected={String(vehicle.id) === value}
              className={[
                styles.option,
                String(vehicle.id) === value ? styles.optionSelected : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onChange(String(vehicle.id))}
            >
              <span>{vehicle.displayName}</span>
              {vehicle.plateNumber ? (
                <span dir="ltr">{vehicle.plateNumber}</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
