"use client";

import { useLocale, useTranslations } from "next-intl";
import { DataSearch } from "@/shared/components/data-search";
import { DateRangePicker } from "@/shared/components/ui/date-range-picker";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import type { OperatingCompanyIdentity } from "@/modules/operating-companies";
import type {
  RoadLiabilitiesListQuery,
  RoadLiabilityChannelFilter,
} from "../../types/road-liabilities.types";
import { ROAD_LIABILITY_CHANNELS } from "../../types/road-liabilities.types";
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
  onDateRangeApply: (from: string, to: string) => void;
  onDateRangeClear: () => void;
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
  onDateRangeApply,
  onDateRangeClear,
}: RoadLiabilitiesToolbarProps) {
  const t = useTranslations("RoadLiabilities");
  const tCompany = useTranslations("OperatingCompanies");
  const tDateRange = useTranslations("DateRangePicker");
  const locale = useLocale();

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
        <p className={styles.count}>{resultsLabel}</p>
      </div>
    </div>
  );
}
