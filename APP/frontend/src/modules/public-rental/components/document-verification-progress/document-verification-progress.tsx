"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon/icon";
import type { DocumentVerificationSubStage } from "../../utils/document-verification-substage";
import styles from "./document-verification-progress.module.css";

interface DocumentVerificationProgressProps {
  subStage: DocumentVerificationSubStage;
}

const ORDER: DocumentVerificationSubStage[] = ["LICENSE", "PASSPORT", "RENTER_DETAILS"];

export function DocumentVerificationProgress({ subStage }: DocumentVerificationProgressProps) {
  const t = useTranslations("PublicRental.documentProgress");
  const labels: Record<DocumentVerificationSubStage, string> = {
    LICENSE: t("license"),
    PASSPORT: t("passport"),
    RENTER_DETAILS: t("renter"),
  };
  const activeIndex = ORDER.indexOf(subStage);

  return (
    <nav
      className={styles.root}
      aria-label={t("label")}
      data-testid="document-verification-progress"
      data-substage={subStage}
    >
      <div className={styles.subRail} data-testid="document-sub-progress-rail" aria-hidden>
        <span className={styles.subRailBase} data-testid="document-sub-progress-rail-base" />
        <span className={styles.subComet} data-testid="document-sub-progress-comet" />
      </div>
      <ol className={styles.list}>
        {ORDER.map((step, index) => {
          const done = index < activeIndex;
          const active = step === subStage;
          return (
            <li
              key={step}
              className={styles.item}
              data-done={done || undefined}
              data-active={active || undefined}
              data-step={step}
            >
              <span className={styles.marker} aria-hidden>
                {done ? (
                  <Icon name="mdi:check" size={14} className={styles.check} />
                ) : (
                  <span className={styles.bullet} />
                )}
              </span>
              <span className={styles.label}>{labels[step]}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
