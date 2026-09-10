"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon";
import { StatCard } from "@/shared/components/ui/stat-card";
import type { RoadLiabilitySummaryDto } from "../../types/road-liabilities.types";
import { formatConfirmedOpenAmount } from "../../utils/road-liability-format";
import styles from "./road-liabilities-summary.module.css";

export interface RoadLiabilitiesSummaryProps {
  summary: RoadLiabilitySummaryDto | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function RoadLiabilitiesSummaryStrip({
  summary,
  loading,
  error,
  onRetry,
}: RoadLiabilitiesSummaryProps) {
  const t = useTranslations("RoadLiabilities");

  if (error) {
    return (
      <div className={styles.error} role="status">
        <p>{error}</p>
        <button type="button" className={styles.retry} onClick={onRetry}>
          {t("retry")}
        </button>
      </div>
    );
  }

  const amount = summary ? formatConfirmedOpenAmount(summary.confirmedOpenAmount) : "—";
  const pending = loading && !summary;

  return (
    <div className={styles.wrap} data-testid="road-liabilities-summary">
      <div className={styles.kpis}>
        <StatCard
          compact
          icon={<Icon name="mdi:cash-multiple" size={15} />}
          label={t("kpi.collectibleAmount")}
          value={pending ? "—" : amount}
        />
        <StatCard
          compact
          icon={<Icon name="mdi:radar" size={15} />}
          label={t("kpi.awaiting")}
          value={pending ? "—" : (summary?.pendingConfirmationCount ?? 0)}
        />
        <StatCard
          compact
          icon={<Icon name="mdi:alert-circle-outline" size={15} />}
          label={t("kpi.needsAttention")}
          value={pending ? "—" : (summary?.needsAttentionCount ?? 0)}
        />
      </div>
    </div>
  );
}
