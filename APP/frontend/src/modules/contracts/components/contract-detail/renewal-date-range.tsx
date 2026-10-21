"use client";

import { useFormatter } from "next-intl";
import { RENEWAL_DATE_TIME_FORMAT, renewalTimelineEndpoints } from "../../utils/renewal-history";
import type { ContractRenewalDto } from "../../types/contract.types";
import styles from "./contract-detail-drawer.module.css";

export interface RenewalDateRangeProps {
  renewal: Pick<ContractRenewalDto, "previousEndAt" | "newEndAt">;
  className?: string;
  "data-testid"?: string;
}

export function RenewalDateRange({
  renewal,
  className,
  "data-testid": testId,
}: RenewalDateRangeProps) {
  const format = useFormatter();
  const { startAt, endAt } = renewalTimelineEndpoints(renewal);
  const fromLabel = format.dateTime(new Date(startAt), RENEWAL_DATE_TIME_FORMAT);
  const toLabel = format.dateTime(new Date(endAt), RENEWAL_DATE_TIME_FORMAT);

  return (
    <span
      className={[styles.renewalTimeline, className].filter(Boolean).join(" ")}
      data-testid={testId}
      data-renewal-from={startAt}
      data-renewal-to={endAt}
    >
      <bdi className={styles.renewalTimelineDate}>{fromLabel}</bdi>
      <span className={styles.renewalTimelineArrow} aria-hidden="true">→</span>
      <bdi className={styles.renewalTimelineDate}>{toLabel}</bdi>
    </span>
  );
}
