"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SimulationButton, useDemoSimulation } from "@/modules/demo-simulation";
import { useOperatingCompanies } from "@/modules/operating-companies";
import { ContractDetailDrawer } from "@/modules/contracts/components/contract-detail/contract-detail-drawer";
import { useRoadLiabilities } from "../../hooks/use-road-liabilities";
import { buildRoadLiabilitiesSimulationOverlay } from "../../utils/road-liability-simulation";
import { resolveRoadLiabilitiesErrorMessage } from "../../utils/resolve-road-liabilities-error";
import { RoadLiabilitiesList } from "../road-liabilities-list/road-liabilities-list";
import { RoadLiabilitiesQueues } from "../road-liabilities-queues/road-liabilities-queues";
import { RoadLiabilitiesSummaryStrip } from "../road-liabilities-summary/road-liabilities-summary";
import { RoadLiabilityDetailDrawer } from "../road-liability-detail/road-liability-detail";
import { RoadLiabilityCollectDialog } from "../road-liability-collect/road-liability-collect-dialog";
import { RoadLiabilityCashCollectDialog } from "../road-liability-collect/road-liability-cash-collect-dialog";
import { RoadLiabilityCollectionFailureDialog } from "../road-liability-collect/road-liability-collection-failure-dialog";
import { useRoadLiabilityCollection } from "../../hooks/use-road-liability-collection";
import { useNotificationRecordTargets } from "@/modules/notifications/simulation/use-notification-record-targets";
import { useRecordFocus } from "@/shared/hooks/use-record-focus";
import rowStyles from "../road-liability-row/road-liability-row.module.css";
import { isSimulatedRoadLiabilityId } from "../../utils/road-liability-status";
import styles from "./road-liabilities-screen.module.css";

export function RoadLiabilitiesScreen() {
  const t = useTranslations("RoadLiabilities");
  const locale = useLocale();
  const router = useRouter();
  const simulation = useDemoSimulation("violations");
  const page = useRoadLiabilities();
  const collection = useRoadLiabilityCollection(page.items, () => {
    if (!page.simulationActive) void page.refresh();
  });
  // Authoritative company list for the filter: the store owns the fetch, the
  // component never calls the API.
  const { companies, isLoading: companiesLoading } = useOperatingCompanies(page.isAllowed);
  const registerNotificationTargets = useNotificationRecordTargets();
  const [contractId, setContractId] = useState<string | null>(null);

  useEffect(() => {
    registerNotificationTargets(
      page.items
        .filter((item) => !isSimulatedRoadLiabilityId(item.id))
        .map((item) => ({
          entityType: "violation" as const,
          entityId: item.id,
          route: "/violations" as const,
          label: item.vehicle?.displayName ?? item.id,
          reference: item.contract?.contractNumber,
        })),
    );
  }, [page.items, registerNotificationTargets]);

  useRecordFocus({
    ready: page.isAllowed && !page.isListLoading,
    version: `${page.pagination?.page ?? 0}:${page.items.map((item) => item.id).join("|")}`,
    highlightClassName: rowStyles.recordFocus,
  });

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
          collection={{
            canCharge: collection.canCharge,
            canCollectRow: collection.canCollectRow,
            canCashCollectRow: collection.canCashCollectRow,
            onCollect: (item) => void collection.openCollectDialog(item),
            onCashCollect: (item) => void collection.openCashCollectDialog(item),
            collectSubmitting:
              collection.collectDialog.submitting || collection.cashCollectDialog.submitting,
            collectSubmittingId:
              collection.collectDialog.item?.id ??
              collection.cashCollectDialog.item?.id ??
              null,
          }}
          toolbar={{
            companies,
            companiesLoading,
            onSearch: page.applySearch,
            onClearSearch: page.clearSearch,
            onCompanyFilter: page.setCompanyFilter,
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

      <RoadLiabilityCollectDialog
        open={collection.collectDialog.open}
        item={collection.collectDialog.item}
        view={collection.collectDialog.view}
        loading={collection.collectDialog.loading}
        submitting={collection.collectDialog.submitting}
        error={collection.collectDialog.error}
        onClose={collection.collectDialog.close}
        onConfirm={collection.collectDialog.confirm}
      />

      <RoadLiabilityCashCollectDialog
        open={collection.cashCollectDialog.open}
        item={collection.cashCollectDialog.item}
        view={collection.cashCollectDialog.view}
        loading={collection.cashCollectDialog.loading}
        submitting={collection.cashCollectDialog.submitting}
        error={collection.cashCollectDialog.error}
        onClose={collection.cashCollectDialog.close}
        onConfirm={collection.cashCollectDialog.confirm}
      />

      <RoadLiabilityCollectionFailureDialog
        open={collection.failureDialog.open}
        failure={collection.failureDialog.failure}
        submitting={collection.failureDialog.submitting}
        action={collection.failureDialog.action}
        error={collection.failureDialog.error}
        onClose={collection.failureDialog.close}
        onManualCollection={collection.failureDialog.startManualCollection}
        onPaymentLink={collection.failureDialog.createPaymentLink}
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
