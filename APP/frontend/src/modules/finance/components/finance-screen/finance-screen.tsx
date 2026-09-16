"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ContractDetailDrawer } from "@/modules/contracts/components/contract-detail/contract-detail-drawer";
import { SimulationButton, useDemoSimulation } from "@/modules/demo-simulation";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AddExpenseDialog } from "../../forms/add-expense/add-expense-dialog";
import { CorrectExpenseDialog } from "../../forms/correct-expense/correct-expense-dialog";
import { VoidExpenseDialog } from "../../forms/void-expense/void-expense-dialog";
import {
  useFinanceExpense,
  useFinanceLedger,
  useFinanceOverview,
  useFinanceReceivables,
} from "../../hooks/use-finance";
import { useFinanceStore } from "../../stores/finance.store";
import { isSimulatedFinanceId, buildFinanceSimulationOverlay } from "../../utils/finance-simulation";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import { ExpenseDetailDrawer } from "../expense-detail-drawer/expense-detail-drawer";
import { FinanceAnalyticsSection } from "../finance-analytics/finance-analytics";
import { FinanceKpis } from "../finance-kpis/finance-kpis";
import { FinanceLedger } from "../finance-ledger/finance-ledger";
import { FinanceOpenReceivables } from "../finance-open-receivables/finance-open-receivables";
import { FinancePeriodControl } from "../finance-period-control/finance-period-control";
import styles from "./finance-screen.module.css";

export function FinanceScreen() {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const router = useRouter();
  const overview = useFinanceOverview();
  const receivables = useFinanceReceivables();
  const ledger = useFinanceLedger();
  const expense = useFinanceExpense();
  const simulation = useDemoSimulation();
  const resetLedgerFilters = useFinanceStore((s) => s.resetLedgerFilters);
  const resetReceivablesFilters = useFinanceStore((s) => s.resetReceivablesFilters);
  const setOverviewQuery = useFinanceStore((s) => s.setOverviewQuery);

  const [addOpen, setAddOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [expenseDrawerOpen, setExpenseDrawerOpen] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const goContracts = () => {
    setContractId(null);
    router.push(`/${locale}/contracts`);
  };

  const enableFinanceSimulation = () => {
    simulation.simulateFinance(buildFinanceSimulationOverlay());
    resetLedgerFilters();
    resetReceivablesFilters();
    setOverviewQuery({ preset: "month", customFrom: "", customTo: "" });
  };

  const resetFinanceSimulation = () => {
    simulation.simulateFinance(buildFinanceSimulationOverlay());
    resetLedgerFilters();
    resetReceivablesFilters();
    setOverviewQuery({ preset: "month", customFrom: "", customTo: "" });
  };

  const disableFinanceSimulation = () => {
    simulation.clearFinanceOverlay();
    void overview.refresh();
  };

  const openContract = (id: string) => {
    if (isSimulatedFinanceId(id)) {
      showNotice(t("simulation.viewDisabled"));
      return;
    }
    setContractId(id);
  };

  const openExpenseDetail = (id: string) => {
    setExpenseDrawerOpen(true);
    void expense.fetchDetail(id);
  };

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        overview.isAllowed ? (
          <div className={styles.headerActions}>
            <SimulationButton
              surface="finance"
              onFinanceSimulate={enableFinanceSimulation}
              onFinanceReset={resetFinanceSimulation}
              onFinanceDisable={disableFinanceSimulation}
            />
            <Button
              type="button"
              variant="secondary"
              size="md"
              data-testid="finance-refresh"
              onClick={() => void overview.refresh()}
            >
              {t("refresh")}
            </Button>
            {overview.canManageExpenses && !overview.simulationActive ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                data-testid="finance-add-expense"
                onClick={() => setAddOpen(true)}
              >
                {t("addExpense")}
              </Button>
            ) : null}
          </div>
        ) : null
      }
    />
  );

  if (!overview.isAllowed) {
    return (
      <>
        {header}
        <section className={styles.denied} role="status" data-testid="finance-denied">
          <p className={styles.deniedTitle}>{t("denied.title")}</p>
          <p>{t("denied.description")}</p>
        </section>
      </>
    );
  }

  const summaryError = resolveFinanceErrorMessage(t, overview.summaryError);

  return (
    <div className={styles.screen} data-testid="finance-screen">
      {header}

      {overview.simulationActive ? (
        <div className={styles.simBanner} data-testid="finance-simulation-banner">
          <strong>{t("simulation.banner")}</strong>
          <span>{t("simulation.bannerHint")}</span>
        </div>
      ) : null}

      <FinancePeriodControl
        preset={overview.overviewQuery.preset}
        customFrom={overview.overviewQuery.customFrom}
        customTo={overview.overviewQuery.customTo}
        lastUpdatedAt={overview.lastUpdatedAt}
        onPresetChange={overview.setPeriodPreset}
        onCustomRangeApply={overview.setCustomPeriod}
      />

      {summaryError ? (
        <div className={styles.summaryError} role="alert">
          <p>{summaryError}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void overview.refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      <FinanceKpis summary={overview.summary} loading={overview.isSummaryLoading} />

      <FinanceLedger
        items={ledger.items}
        meta={ledger.meta}
        search={ledger.query.search}
        direction={ledger.query.direction}
        displaySource={ledger.query.displaySource}
        loading={ledger.isLoading}
        error={ledger.error}
        onSearch={ledger.applySearch}
        onClearSearch={ledger.clearSearch}
        onDirectionChange={ledger.setDirection}
        onSourceChange={ledger.setSource}
        onClearFilters={ledger.clearFilters}
        onPageChange={ledger.setPage}
        onRetry={() => void overview.refresh()}
        onViewContract={openContract}
        onViewExpense={openExpenseDetail}
      />

      <FinanceAnalyticsSection
        analytics={overview.analytics}
        loading={overview.isAnalyticsLoading}
        error={overview.analyticsError}
        onRetry={() => void overview.refresh()}
      />

      <FinanceOpenReceivables
        items={receivables.items}
        meta={receivables.meta}
        search={receivables.query.search}
        sourceType={receivables.query.sourceType}
        sort={receivables.query.sort}
        loading={receivables.isLoading}
        error={receivables.error}
        onSearch={receivables.applySearch}
        onClearSearch={receivables.clearSearch}
        onSourceTypeChange={receivables.setSourceType}
        onSortChange={receivables.setSort}
        onPageChange={receivables.setPage}
        onRetry={() => void overview.refresh()}
        onViewContract={openContract}
      />

      <AddExpenseDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => showNotice(t("expense.createSuccess"))}
      />

      <ExpenseDetailDrawer
        open={expenseDrawerOpen}
        detail={expense.detail}
        loading={expense.isDetailLoading}
        error={expense.detailError}
        canManage={overview.canManageExpenses}
        demoOnly={Boolean(expense.detailId && isSimulatedFinanceId(expense.detailId))}
        onClose={() => {
          setExpenseDrawerOpen(false);
          expense.clearDetail();
        }}
        onRetry={() => {
          if (expense.detailId) void expense.fetchDetail(expense.detailId);
        }}
        onVoid={() => setVoidOpen(true)}
        onCorrect={() => setCorrectOpen(true)}
      />

      <VoidExpenseDialog
        open={voidOpen}
        expenseId={expense.detailId}
        onClose={() => setVoidOpen(false)}
        onSuccess={() => showNotice(t("expense.voidSuccess"))}
      />

      <CorrectExpenseDialog
        open={correctOpen}
        expense={expense.detail}
        onClose={() => setCorrectOpen(false)}
        onSuccess={() => showNotice(t("expense.correctSuccess"))}
      />

      <ContractDetailDrawer
        contractId={contractId}
        onClose={() => setContractId(null)}
        onGenerateRentalLink={goContracts}
        onCarOut={goContracts}
        onCarIn={goContracts}
        onReturnLink={goContracts}
        onRenew={goContracts}
        onReconcile={goContracts}
        onCloseContract={goContracts}
      />

      {notice ? (
        <div className={styles.notice} role="status" data-testid="finance-notice">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
