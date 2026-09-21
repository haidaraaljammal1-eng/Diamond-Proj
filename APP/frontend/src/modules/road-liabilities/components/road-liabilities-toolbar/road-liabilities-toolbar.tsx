"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import { DateRangePicker } from "@/shared/components/ui/date-range-picker";
import { Drawer } from "@/shared/components/ui/drawer";
import { Popover } from "@/shared/components/ui/popover";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type { OperatingCompanyIdentity } from "@/modules/operating-companies";
import type {
  RoadLiabilitiesListQuery,
  RoadLiabilityAttributionFilter,
  RoadLiabilityChannelFilter,
  RoadLiabilityCollectionFilter,
  RoadLiabilityConfirmationFilter,
  RoadLiabilitySourceFilter,
  RoadLiabilityTypeFilter,
} from "../../types/road-liabilities.types";
import {
  ROAD_LIABILITY_ATTRIBUTIONS,
  ROAD_LIABILITY_CHANNELS,
  ROAD_LIABILITY_COLLECTIONS,
  ROAD_LIABILITY_CONFIRMATIONS,
  ROAD_LIABILITY_SOURCES,
  ROAD_LIABILITY_TYPES,
} from "../../types/road-liabilities.types";
import { countRoadLiabilityAdvancedFilters } from "../../utils/road-liability-filters";
import styles from "./road-liabilities-toolbar.module.css";

/** Sentinel for "All Companies" — a Select value is a string, a company id is not. */
const ALL_COMPANIES = "__all_companies__";

export interface RoadLiabilitiesToolbarProps {
  query: RoadLiabilitiesListQuery;
  resultsLabel: string;
  loading: boolean;
  companies: OperatingCompanyIdentity[];
  companiesLoading: boolean;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  onCompanyFilter: (companyId: number | null) => void;
  onChannelFilter: (value: RoadLiabilityChannelFilter) => void;
  onTypeFilter: (value: RoadLiabilityTypeFilter) => void;
  onSourceFilter: (value: RoadLiabilitySourceFilter) => void;
  onConfirmationFilter: (value: RoadLiabilityConfirmationFilter) => void;
  onAttributionFilter: (value: RoadLiabilityAttributionFilter) => void;
  onCollectionFilter: (value: RoadLiabilityCollectionFilter) => void;
  onDateRangeApply: (from: string, to: string) => void;
  onDateRangeClear: () => void;
  onClearAdvanced: () => void;
}

function useIsNarrow(maxWidth = 720) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [maxWidth]);
  return narrow;
}

export function RoadLiabilitiesToolbar({
  query,
  resultsLabel,
  loading,
  companies,
  companiesLoading,
  onSearch,
  onClearSearch,
  onCompanyFilter,
  onChannelFilter,
  onTypeFilter,
  onSourceFilter,
  onConfirmationFilter,
  onAttributionFilter,
  onCollectionFilter,
  onDateRangeApply,
  onDateRangeClear,
  onClearAdvanced,
}: RoadLiabilitiesToolbarProps) {
  const t = useTranslations("RoadLiabilities");
  const tCompany = useTranslations("OperatingCompanies");
  const tDateRange = useTranslations("DateRangePicker");
  const locale = useLocale();
  const narrow = useIsNarrow();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedCount = countRoadLiabilityAdvancedFilters(query);

  // Built from the authoritative company store — never a hardcoded UNIQUE/ELITE list.
  const companyOptions: SelectOption<string>[] = [
    { value: ALL_COMPANIES, label: tCompany("all") },
    ...companies.map((company) => ({ value: String(company.id), label: company.displayName })),
  ];

  const channelOptions: SelectOption<RoadLiabilityChannelFilter>[] = [
    { value: "all", label: t("filters.all") },
    ...ROAD_LIABILITY_CHANNELS.map((value) => ({
      value,
      label: t(`channel.${value}`),
    })),
  ];

  const typeOptions: SelectOption<RoadLiabilityTypeFilter>[] = [
    { value: "all", label: t("filters.all") },
    ...ROAD_LIABILITY_TYPES.map((value) => ({
      value,
      label: t(`type.${value}`),
    })),
  ];

  const sourceOptions: SelectOption<RoadLiabilitySourceFilter>[] = [
    { value: "all", label: t("filters.all") },
    ...ROAD_LIABILITY_SOURCES.map((value) => ({
      value,
      label: t(`source.${value}`),
    })),
  ];

  const confirmationOptions: SelectOption<RoadLiabilityConfirmationFilter>[] = [
    { value: "all", label: t("filters.all") },
    ...ROAD_LIABILITY_CONFIRMATIONS.map((value) => ({
      value,
      label: t(`confirmation.${value}`),
    })),
  ];

  const attributionOptions: SelectOption<RoadLiabilityAttributionFilter>[] = [
    { value: "all", label: t("filters.all") },
    ...ROAD_LIABILITY_ATTRIBUTIONS.map((value) => ({
      value,
      label: t(`attribution.${value}`),
    })),
  ];

  const collectionOptions: SelectOption<RoadLiabilityCollectionFilter>[] = [
    { value: "all", label: t("filters.all") },
    ...ROAD_LIABILITY_COLLECTIONS.map((value) => ({
      value,
      label: t(`collection.${value}`),
    })),
  ];

  const advancedLabel =
    advancedCount > 0
      ? t("filters.advancedWithCount", { count: advancedCount })
      : t("filters.advanced");

  const advancedFields = (
    <div className={styles.advancedGrid} data-testid="road-liabilities-advanced-panel">
      <div className={styles.filter}>
        <p className={styles.filterLabel}>{t("filters.type")}</p>
        <Select
          size="sm"
          variant="ghost"
          value={query.type}
          options={typeOptions}
          onChange={onTypeFilter}
          aria-label={t("filters.type")}
        />
      </div>
      <div className={styles.filter}>
        <p className={styles.filterLabel}>{t("filters.source")}</p>
        <Select
          size="sm"
          variant="ghost"
          value={query.sourceKey}
          options={sourceOptions}
          onChange={onSourceFilter}
          aria-label={t("filters.source")}
        />
      </div>
      <div className={styles.filter}>
        <p className={styles.filterLabel}>{t("filters.confirmation")}</p>
        <Select
          size="sm"
          variant="ghost"
          value={query.confirmationStatus}
          options={confirmationOptions}
          onChange={onConfirmationFilter}
          aria-label={t("filters.confirmation")}
        />
      </div>
      <div className={styles.filter}>
        <p className={styles.filterLabel}>{t("filters.attribution")}</p>
        <Select
          size="sm"
          variant="ghost"
          value={query.attributionStatus}
          options={attributionOptions}
          onChange={onAttributionFilter}
          aria-label={t("filters.attribution")}
        />
      </div>
      <div className={styles.filter}>
        <p className={styles.filterLabel}>{t("filters.collection")}</p>
        <Select
          size="sm"
          variant="ghost"
          value={query.collectionStatus}
          options={collectionOptions}
          onChange={onCollectionFilter}
          aria-label={t("filters.collection")}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={styles.clearAdvanced}
        data-testid="road-liabilities-clear-advanced"
        onClick={() => {
          onClearAdvanced();
          setAdvancedOpen(false);
        }}
      >
        {t("filters.clearAdvanced")}
      </Button>
    </div>
  );

  return (
    <div className={styles.toolbar} data-testid="road-liabilities-toolbar">
      <div className={styles.row}>
        <DataSearch
          appliedValue={query.search}
          onSearch={onSearch}
          onClear={onClearSearch}
          placeholder={t("search.placeholder")}
          inputLabel={t("search.inputLabel")}
          searchButtonLabel={t("search.button")}
          clearButtonLabel={t("search.clear")}
          loading={loading}
          inputTestId="road-liabilities-search"
          className={styles.search}
        />
        <div className={styles.filter} data-testid="road-liabilities-company">
          <p className={styles.filterLabel}>{tCompany("company")}</p>
          <Select
            size="sm"
            variant="ghost"
            value={query.companyId == null ? ALL_COMPANIES : String(query.companyId)}
            options={companyOptions}
            onChange={(value) =>
              onCompanyFilter(value === ALL_COMPANIES ? null : Number(value))
            }
            placeholder={companiesLoading ? tCompany("loading") : tCompany("all")}
            disabled={companiesLoading && companies.length === 0}
            aria-label={tCompany("company")}
          />
        </div>
        <div className={styles.filter} data-testid="road-liabilities-channel">
          <p className={styles.filterLabel}>{t("filters.channel")}</p>
          <Select
            size="sm"
            variant="ghost"
            value={query.channel}
            options={channelOptions}
            onChange={onChannelFilter}
            aria-label={t("filters.channel")}
          />
        </div>
        <DateRangePicker
          className={styles.dateRange}
          value={{ from: query.from, to: query.to }}
          locale={locale}
          aria-label={t("filters.dateRange")}
          onApply={(range) => onDateRangeApply(range.from, range.to)}
          onClear={onDateRangeClear}
          labels={{
            fieldLabel: t("filters.dateRange"),
            placeholder: tDateRange("placeholder"),
            apply: tDateRange("apply"),
            clear: tDateRange("clear"),
            daysSelected: (count: number) => tDateRange("daysSelected", { count }),
            previousMonth: tDateRange("previousMonth"),
            nextMonth: tDateRange("nextMonth"),
            presets: {
              today: tDateRange("presets.today"),
              last7: tDateRange("presets.last7"),
              last30: tDateRange("presets.last30"),
              thisMonth: tDateRange("presets.thisMonth"),
              lastMonth: tDateRange("presets.lastMonth"),
              custom: tDateRange("presets.custom"),
            },
          }}
        />
        {narrow ? (
          <>
            <button
              type="button"
              className={styles.advancedTrigger}
              data-testid="road-liabilities-advanced"
              onClick={() => setAdvancedOpen(true)}
            >
              {advancedLabel}
            </button>
            <Drawer
              open={advancedOpen}
              onClose={() => setAdvancedOpen(false)}
              title={t("filters.advanced")}
              closeLabel={t("detail.close")}
            >
              {advancedFields}
            </Drawer>
          </>
        ) : (
          <Popover
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            className={styles.advancedPopover}
            panelClassName={styles.advancedPanel}
            trigger={({ ref, id, ...triggerProps }) => (
              <button
                {...triggerProps}
                ref={ref}
                id={id}
                type="button"
                className={styles.advancedTrigger}
                data-testid="road-liabilities-advanced"
              >
                {advancedLabel}
              </button>
            )}
          >
            {advancedFields}
          </Popover>
        )}
        <p className={styles.count}>{resultsLabel}</p>
      </div>
    </div>
  );
}
