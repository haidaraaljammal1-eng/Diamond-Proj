"use client";

import { useTranslations } from "next-intl";
import { DataSearch } from "@/shared/components/data-search";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { useOperatingCompanies } from "@/modules/operating-companies";
import { useFinanceVehicleSearch } from "../../hooks/use-finance-vehicle-search";
import styles from "./finance-vehicle-picker.module.css";

const ALL_COMPANIES = "__all_companies__";

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
  const tCompany = useTranslations("OperatingCompanies");
  const {
    vehicles,
    isLoading,
    search,
    companyId,
    applySearch,
    clearSearch,
    setCompany,
  } = useFinanceVehicleSearch(open);
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
        placeholder={t("expense.vehicleSearchPlaceholder")}
        inputLabel={t("expense.vehicleSearchLabel")}
        searchButtonLabel={t("search")}
        clearButtonLabel={t("clear")}
        loading={isLoading}
        embedded
      />

      {/* Company narrows the same server-side fleet query as the search. */}
      <Select
        variant="ghost"
        size="sm"
        options={companyOptions}
        value={companyId == null ? ALL_COMPANIES : String(companyId)}
        onChange={(next) => setCompany(next === ALL_COMPANIES ? null : Number(next))}
        placeholder={companiesLoading ? tCompany("loading") : tCompany("all")}
        disabled={companiesLoading && companies.length === 0}
        aria-label={tCompany("company")}
      />

      {selected ? (
        <p className={styles.selected} data-testid="finance-vehicle-selected">
          <span>{selected.displayName}</span>
          {selected.plateNumber ? (
            <span dir="ltr">{selected.plateNumber}</span>
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
              <span className={styles.optionBody}>
                <span className={styles.optionName}>{vehicle.displayName}</span>
                <CompanyIdentity company={vehicle.company} compact />
              </span>
              {vehicle.plateNumber ? (
                <span className={styles.optionPlate} dir="ltr">
                  {vehicle.plateNumber}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
