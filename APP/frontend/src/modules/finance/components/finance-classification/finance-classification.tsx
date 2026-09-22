"use client";

import { useTranslations } from "next-intl";
import { CompanyIdentity } from "@/shared/components/company-identity";
import type { FinanceCompanyRef } from "../../types/finance.types";
import styles from "./finance-classification.module.css";

/**
 * Real companies use the shared marker. `null` is GENERAL — neutral text, never
 * a fabricated company, accent, or CompanyIdentity.
 */
export function FinanceClassification({
  company,
}: {
  company?: FinanceCompanyRef | null;
}) {
  const t = useTranslations("OperatingCompanies");
  if (company) {
    return <CompanyIdentity company={company} compact />;
  }
  if (company === null) {
    return (
      <span className={styles.general} data-testid="finance-general">
        {t("general")}
      </span>
    );
  }
  return null;
}
