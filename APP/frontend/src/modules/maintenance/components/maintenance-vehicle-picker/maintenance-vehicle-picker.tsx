"use client";

import { useTranslations } from "next-intl";
import { DataSearch } from "@/shared/components/data-search";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
import type { VehicleCardDto } from "@/modules/vehicles/types/vehicle.types";
import { useAvailableMaintenanceVehicles } from "../../hooks/use-available-maintenance-vehicles";
import styles from "./maintenance-vehicle-picker.module.css";

export interface MaintenanceVehiclePickerProps {
  open: boolean;
  value: string;
  onChange: (vehicleId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  labelledBy?: string;
  /** Opt into DataSearch `embedded` when this picker sits inside a parent form. */
  embeddedSearch?: boolean;
}

export function MaintenanceVehiclePicker({
  open,
  value,
  onChange,
  disabled = false,
  invalid = false,
  labelledBy,
  embeddedSearch = false,
}: MaintenanceVehiclePickerProps) {
  const t = useTranslations("Maintenance");
  const {
    vehicles,
    isLoading,
    search,
    applySearch,
    clearSearch,
  } = useAvailableMaintenanceVehicles(open);

  const selected = vehicles.find((vehicle) => String(vehicle.id) === value);

  return (
    <div className={styles.root}>
      <DataSearch
        appliedValue={search}
        onSearch={applySearch}
        onClear={clearSearch}
        placeholder={t("vehicleSearch.placeholder")}
        inputLabel={t("vehicleSearch.inputLabel")}
        searchButtonLabel={t("search.button")}
        clearButtonLabel={t("search.clear")}
        loading={isLoading}
        embedded={embeddedSearch}
      />

      {selected ? (
        <p className={styles.selected} data-testid="maintenance-vehicle-selected">
          <span className={styles.selectedName}>{selected.displayName}</span>
          {selected.plateNumber ? (
            <span className={styles.plate} dir="ltr">
              {selected.plateNumber}
            </span>
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
          <p className={styles.empty}>{t("vehicleSearch.loading")}</p>
        ) : vehicles.length === 0 ? (
          <p className={styles.empty}>{t("vehicleSearch.empty")}</p>
        ) : (
          vehicles.map((vehicle) => (
            <VehicleOption
              key={vehicle.id}
              vehicle={vehicle}
              selected={String(vehicle.id) === value}
              disabled={disabled}
              onSelect={() => onChange(String(vehicle.id))}
            />
          ))
        )}
      </div>
    </div>
  );
}

function VehicleOption({
  vehicle,
  selected,
  disabled,
  onSelect,
}: {
  vehicle: VehicleCardDto;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("Maintenance");
  const meta = [vehicle.modelYear, vehicle.color].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={[styles.option, selected ? styles.optionOn : ""].join(" ")}
      disabled={disabled}
      onClick={onSelect}
    >
      <VehicleImage
        path={vehicle.primaryImage?.url}
        alt=""
        className={styles.thumb}
      />
      <span className={styles.optionBody}>
        <span className={styles.name}>{vehicle.displayName}</span>
        <span className={styles.plate} dir="ltr">
          {vehicle.plateNumber || t("noPlate")}
        </span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
    </button>
  );
}
