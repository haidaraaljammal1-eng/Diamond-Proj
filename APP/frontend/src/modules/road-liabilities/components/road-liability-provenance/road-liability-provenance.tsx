"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { RoadLiabilityProvenanceDto } from "../../types/road-liabilities.types";
import {
  sourceFallbackLabel,
  sourceTranslationKey,
  typeTranslationKey,
} from "../../utils/road-liability-status";
import { toValidOccurredDate } from "../../utils/road-liability-format";
import styles from "./road-liability-provenance.module.css";

export interface RoadLiabilityProvenanceProps {
  entries: RoadLiabilityProvenanceDto[];
}

export function RoadLiabilityProvenanceTimeline({ entries }: RoadLiabilityProvenanceProps) {
  const t = useTranslations("RoadLiabilities");
  const format = useFormatter();

  if (entries.length === 0) {
    return <p className={styles.meta}>{t("provenance.empty")}</p>;
  }

  const ordered = [...entries].sort((a, b) => {
    const aTime = Date.parse(a.occurredAt) || Date.parse(a.receivedAt) || 0;
    const bTime = Date.parse(b.occurredAt) || Date.parse(b.receivedAt) || 0;
    return aTime - bTime;
  });

  return (
    <ol className={styles.list} data-testid="road-liability-provenance">
      {ordered.map((entry) => {
        const occurred = toValidOccurredDate(entry.occurredAt);
        const sourceI18nKey = sourceTranslationKey(entry.sourceKey);
        const sourceLabel = sourceI18nKey
          ? t(sourceI18nKey)
          : sourceFallbackLabel(entry.sourceKey);
        const kind = entry.authoritative
          ? t("provenance.authoritative")
          : t("provenance.prediction");
        return (
          <li key={entry.id} className={styles.item}>
            <div className={styles.rail}>
              <span
                className={[
                  styles.node,
                  entry.authoritative ? styles.authoritative : styles.prediction,
                ].join(" ")}
                aria-hidden="true"
              />
            </div>
            <div className={styles.body}>
              <p className={styles.title}>{sourceLabel}</p>
              <p className={styles.meta}>
                {t(typeTranslationKey(entry.eventType))}
                {occurred ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    {format.dateTime(occurred, { dateStyle: "medium", timeStyle: "short" })}
                  </>
                ) : null}
              </p>
              {entry.externalReference ? (
                <p className={styles.meta} dir="ltr">
                  {entry.externalReference}
                </p>
              ) : null}
              <span
                className={[
                  styles.kind,
                  entry.authoritative ? "" : styles.kindPrediction,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {kind}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
