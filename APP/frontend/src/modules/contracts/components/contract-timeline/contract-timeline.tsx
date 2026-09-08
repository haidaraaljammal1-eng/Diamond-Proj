"use client";

import { useTranslations } from "next-intl";
import type { ContractStatus } from "../../types/contract.types";
import { getContractTimeline } from "../../utils/contract-timeline";
import styles from "./contract-timeline.module.css";

export interface ContractTimelineProps {
  status: ContractStatus;
}

export function ContractTimeline({ status }: ContractTimelineProps) {
  const t = useTranslations("Contracts.timeline");
  const steps = getContractTimeline(status);

  return (
    <ol className={styles.list} aria-label={t("title")} data-testid="contract-timeline">
      {steps.map((step) => (
        <li
          key={step.key}
          className={[styles.row, styles[step.state]].join(" ")}
        >
          <span className={styles.node} aria-hidden="true" />
          <div className={styles.text}>
            <b>{t(step.key)}</b>
            <span>{t(`${step.key}Hint`)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
