"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { downloadFinanceStatementPdf } from "../../api/finance.api";
import type {
  FinanceStatementExportParams,
  StatementCompanyCode,
} from "../../types/finance.types";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import { FinanceStatementExportDialog } from "./finance-statement-export-dialog";
import styles from "./finance-statements-section.module.css";

export interface FinanceStatementsSectionProps {
  periodPrefill: FinanceStatementExportParams;
}

export function FinanceStatementsSection({ periodPrefill }: FinanceStatementsSectionProps) {
  const t = useTranslations("Finance");
  const [dialogCompany, setDialogCompany] = useState<StatementCompanyCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(() => periodPrefill, [periodPrefill]);

  const triggerDownload = useCallback(
    async (companyCode: StatementCompanyCode, params: FinanceStatementExportParams) => {
      setLoading(true);
      setError(null);
      try {
        const { blob, filename } = await downloadFinanceStatementPdf(companyCode, params);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        setDialogCompany(null);
      } catch (err) {
        setError(resolveFinanceErrorMessage(t, err));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  return (
    <section className={styles.wrap} data-testid="finance-statements-section">
      <div className={styles.head}>
        <h2 className={styles.title}>{t("statements.sectionTitle")}</h2>
        <p className={styles.hint}>{t("statements.sectionHint")}</p>
      </div>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          size="md"
          data-testid="finance-statement-elite"
          onClick={() => setDialogCompany("ELITE")}
        >
          {t("statements.downloadElite")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          data-testid="finance-statement-unique"
          onClick={() => setDialogCompany("UNIQUE")}
        >
          {t("statements.downloadUnique")}
        </Button>
      </div>
      {error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : null}
      <FinanceStatementExportDialog
        open={dialogCompany != null}
        companyCode={dialogCompany}
        initial={initial}
        loading={loading}
        onClose={() => {
          if (!loading) setDialogCompany(null);
        }}
        onDownload={(params) => {
          if (dialogCompany) void triggerDownload(dialogCompany, params);
        }}
      />
    </section>
  );
}
