"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SimulationButton, useDemoSimulation } from "@/modules/demo-simulation";
import { ContractDetailDrawer } from "@/modules/contracts/components/contract-detail/contract-detail-drawer";
import { useRoadLiabilities } from "../../hooks/use-road-liabilities";
import { buildRoadLiabilitiesSimulationOverlay } from "../../utils/road-liability-simulation";
import { resolveRoadLiabilitiesErrorMessage } from "../../utils/resolve-road-liabilities-error";
import { RoadLiabilitiesList } from "../road-liabilities-list/road-liabilities-list";
import { RoadLiabilitiesQueues } from "../road-liabilities-queues/road-liabilities-queues";
import { RoadLiabilitiesSummaryStrip } from "../road-liabilities-summary/road-liabilities-summary";
import { RoadLiabilityDetailDrawer } from "../road-liability-detail/road-liability-detail";
import styles from "./road-liabilities-screen.module.css";

export function RoadLiabilitiesScreen() {
  const t = useTranslations("RoadLiabilities");
  const locale = useLocale();
  const router = useRouter();
  const simulation = useDemoSimulation("violations");
  const page = useRoadLiabilities();
  const [contractId, setContractId] = useState<string | null>(null);

  const goContracts = () => {
    setContractId(null);
    router.push(`/${locale}/contracts`);
  };

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        page.isAllowed ? (
          <div className={styles.headerActions}>
            <SimulationButton
              surface="violations"
              onViolationsSimulate={() => {
                simulation.simulateRoadLiabilities(buildRoadLiabilitiesSimulationOverlay());
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="md"
              data-testid="road-liabilities-refresh"
              onClick={() => void page.refresh()}
              disabled={page.isRefreshing}
            >
              {t("refresh")}
            </Button>
          </div>
        ) : null
      }
    />
  );

  if (!page.isAllowed) {
    return (
      <>
        {header}
        <section className={styles.denied} role="status" data-testid="road-liabilities-denied">
          <p className={styles.deniedTitle}>{t("denied.title")}</p>
          <p>{t("denied.description")}</p>
        </section>
      </>
    );
  }

  return (
    <div className={styles.screen} data-testid="road-liabilities-screen">
      {header}
      <RoadLiabilitiesSummaryStrip
        summary={page.summary}
        loading={page.isSummaryLoading}
        error={resolveRoadLiabilitiesErrorMessage(t, page.summaryError)}
        onRetry={() => void page.refresh()}
      />
      <RoadLiabilitiesQueues value={page.query.queue} onChange={page.setQueue} />

      <div className={styles.surface}>
        <RoadLiabilitiesList
          items={page.items}
          meta={page.pagination}
          query={page.query}
          selectedLiabilityId={page.selectedLiabilityId}
          loading={page.isListLoading}
          error={resolveRoadLiabilitiesErrorMessage(t, page.listError)}
          resultsLabel={
            page.isListLoading && page.pagination == null
              ? t("list.loading")
              : t("list.results", {
                  count: page.pagination?.total ?? page.items.length,
                })
          }
          onSelect={page.selectLiability}
          onRetry={() => void page.refresh()}
          onPage={page.setPage}
          toolbar={{
            onSearch: page.applySearch,
            onClearSearch: page.clearSearch,
            onChannelFilter: page.setChannelFilter,
            onTypeFilter: page.setTypeFilter,
            onSourceFilter: page.setSourceFilter,
            onConfirmationFilter: page.setConfirmationFilter,
            onAttributionFilter: page.setAttributionFilter,
            onCollectionFilter: page.setCollectionFilter,
            onDateRangeApply: page.setDateRange,
            onDateRangeClear: () => page.setDateRange("", ""),
            onClearAdvanced: page.clearFilters,
          }}
        />
      </div>

      <RoadLiabilityDetailDrawer
        open={page.detailOpen}
        detail={page.selectedDetail}
        loading={page.isDetailLoading}
        error={resolveRoadLiabilitiesErrorMessage(t, page.detailError)}
        onClose={page.closeDetail}
        onRetry={() => {
          if (page.selectedLiabilityId) page.selectLiability(page.selectedLiabilityId);
        }}
        onViewContract={(id) => {
          page.closeDetail();
          setContractId(id);
        }}
        onViewGps={(vehicleId) => {
          page.closeDetail();
          router.push(`/${locale}/gps?vehicleId=${vehicleId}`);
        }}
        onChargeConfirmed={() => {
          if (!page.simulationActive) void page.refresh();
        }}
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
    </div>
  );
}
