"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/shared/components/ui/empty-state";
import styles from "./road-liabilities-empty.module.css";

export function RoadLiabilitiesEmpty() {
  const t = useTranslations("RoadLiabilities");

  return (
    <div className={styles.empty} data-testid="road-liabilities-empty">
      <EmptyState title={t("empty.title")} description={t("empty.description")} />
    </div>
  );
}
