"use client";

import { useTranslations } from "next-intl";
import type { RoadLiabilityQueueFilter } from "../../types/road-liabilities.types";
import styles from "./road-liabilities-queues.module.css";

const QUEUES: RoadLiabilityQueueFilter[] = [
  "all",
  "collectible",
  "needs_attention",
  "settled",
];

export interface RoadLiabilitiesQueuesProps {
  value: RoadLiabilityQueueFilter;
  onChange: (queue: RoadLiabilityQueueFilter) => void;
}

export function RoadLiabilitiesQueues({ value, onChange }: RoadLiabilitiesQueuesProps) {
  const t = useTranslations("RoadLiabilities");

  return (
    <div
      className={styles.queues}
      role="tablist"
      aria-label={t("queues.label")}
      data-testid="road-liabilities-queues"
    >
      {QUEUES.map((queue) => {
        const active = value === queue;
        return (
          <button
            key={queue}
            type="button"
            role="tab"
            aria-selected={active}
            className={styles.tab}
            data-active={active ? "true" : "false"}
            data-testid={`road-liabilities-queue-${queue}`}
            onClick={() => onChange(queue)}
          >
            {t(`queues.${queue}`)}
          </button>
        );
      })}
    </div>
  );
}
