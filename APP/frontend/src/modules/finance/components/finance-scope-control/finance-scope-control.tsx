"use client";

import { useTranslations } from "next-intl";
import { useOperatingCompanies } from "@/modules/operating-companies";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type { FinanceCompanyScopeSelection } from "../../types/finance.types";
import styles from "./finance-scope-control.module.css";

export interface FinanceScopeControlProps {
  scope: FinanceCompanyScopeSelection;
  onChange: (scope: FinanceCompanyScopeSelection) => void;
}

export function FinanceScopeControl({ scope, onChange }: FinanceScopeControlProps) {
  const t = useTranslations("Finance");
  const tCompany = useTranslations("OperatingCompanies");
  const { companies } = useOperatingCompanies();
  const value = scope.kind === "COMPANY" ? String(scope.companyId) : scope.kind;
  const options: SelectOption<string>[] = [
    { value: "ALL", label: t("scope.all") },
    ...companies.map((company) => ({
      value: String(company.id),
      label: company.displayName,
    })),
    { value: "GENERAL", label: tCompany("general") },
  ];

  return (
    <div className={styles.scope} data-testid="finance-company-scope">
      <Select
        variant="ghost"
        size="sm"
        options={options}
        value={value}
        onChange={(next) => {
          if (next === "ALL") onChange({ kind: "ALL" });
          else if (next === "GENERAL") onChange({ kind: "GENERAL" });
          else onChange({ kind: "COMPANY", companyId: Number(next) });
        }}
        aria-label={t("scope.label")}
      />
    </div>
  );
}
