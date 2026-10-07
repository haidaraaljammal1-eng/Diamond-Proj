"use client";

import { useTranslations } from "next-intl";
import type { InvoiceCompanyCodeFilter } from "../../types/invoices.types";
import styles from "./invoices-company-filter.module.css";

const OPTIONS: InvoiceCompanyCodeFilter[] = ["ALL", "ELITE", "UNIQUE"];

export interface InvoicesCompanyFilterProps {
  value: InvoiceCompanyCodeFilter;
  onChange: (value: InvoiceCompanyCodeFilter) => void;
}

export function InvoicesCompanyFilter({ value, onChange }: InvoicesCompanyFilterProps) {
  const t = useTranslations("Invoices");

  return (
    <div
      className={styles.filter}
      role="tablist"
      aria-label={t("filters.company")}
      data-testid="invoices-company-filter"
    >
      {OPTIONS.map((code) => {
        const active = value === code;
        return (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={active}
            className={styles.tab}
            data-active={active ? "true" : "false"}
            data-testid={`invoices-company-${code}`}
            onClick={() => onChange(code)}
          >
            {t(`filters.companyOptions.${code}`)}
          </button>
        );
      })}
    </div>
  );
}
