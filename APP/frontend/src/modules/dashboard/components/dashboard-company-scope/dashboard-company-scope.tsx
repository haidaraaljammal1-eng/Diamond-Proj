"use client";

import { useTranslations } from "next-intl";
import { useOperatingCompanies } from "@/modules/operating-companies";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import styles from "./dashboard-company-scope.module.css";

export interface DashboardCompanyScopeProps {
  companyId: number | null;
  onChange: (companyId: number | null) => void;
}

/** All Companies plus the active operating companies. Finance's null classification is not offered. */
export function DashboardCompanyScope({ companyId, onChange }: DashboardCompanyScopeProps) {
  const tCompany = useTranslations("OperatingCompanies");
  const { companies } = useOperatingCompanies();
  const options: SelectOption<string>[] = [
    { value: "ALL", label: tCompany("all") },
    ...companies.map((company) => ({
      value: String(company.id),
      label: company.displayName,
    })),
  ];

  return (
    <div className={styles.scope} data-testid="dashboard-company-scope">
      <Select
        variant="ghost"
        size="sm"
        options={options}
        value={companyId == null ? "ALL" : String(companyId)}
        onChange={(next) => onChange(next === "ALL" ? null : Number(next))}
        aria-label={tCompany("company")}
      />
    </div>
  );
}
