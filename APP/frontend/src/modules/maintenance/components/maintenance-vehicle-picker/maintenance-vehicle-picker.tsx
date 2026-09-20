"use client";

import { useTranslations } from "next-intl";
import { DataSearch } from "@/shared/components/data-search";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { useOperatingCompanies } from "@/modules/operating-companies";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
import type { VehicleCardDto } from "@/modules/vehicles/types/vehicle.types";
import { useAvailableMaintenanceVehicles } from "../../hooks/use-available-maintenance-vehicles";
import styles from "./maintenance-vehicle-picker.module.css";

const ALL_COMPANIES = "__all_companies__";

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
  const tCompany = useTranslations("OperatingCompanies");
  const {
    vehicles,
    isLoading,
    search,
    companyId,
    applySearch,
    clearSearch,
    setCompany,
  } = useAvailableMaintenanceVehicles(open);
  const { companies, isLoading: companiesLoading } = useOperatingCompanies(open);

  const selected = vehicles.find((vehicle) => String(vehicle.id) === value);
  const companyOptions: SelectOption[] = [
    { value: ALL_COMPANIES, label: tCompany("all") },
    ...companies.map((company) => ({
      value: String(company.id),
      label: company.displayName,
    })),
  ];

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

      {/* Company narrows the same server-side fleet query as the search. */}
      <Select
        variant="ghost"
        size="sm"
        options={companyOptions}
        value={companyId == null ? ALL_COMPANIES : String(companyId)}
        onChange={(next) => setCompany(next === ALL_COMPANIES ? null : Number(next))}
        placeholder={companiesLoading ? tCompany("loading") : tCompany("all")}
        disabled={disabled || (companiesLoading && companies.length === 0)}
        aria-label={tCompany("company")}
      />

      {selected ? (
        <p className={styles.selected} data-testid="maintenance-vehicle-selected">
          <span className={styles.selectedName}>{selected.displayName}</span>
          {selected.plateNumber ? (
            <span className={styles.plate} dir="ltr">
              {selected.plateNumber}
            </span>
          ) : null}
          {/* Company must survive selection — staff never lose track of it. */}
          <CompanyIdentity company={selected.company} compact />
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
        <span className={styles.identityRow}>
          <span className={styles.plate} dir="ltr">
            {vehicle.plateNumber || t("noPlate")}
          </span>
          <CompanyIdentity company={vehicle.company} compact />
        </span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
    </button>
  );
}
