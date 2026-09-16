"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { formatAed } from "@/modules/dashboard/utils/money";
import type { ChargeReviewUiState } from "../../types/road-liability-charge-review.types";
import styles from "./road-liability-charge-review.module.css";

export interface RoadLiabilityChargeReviewSectionProps {
  ui: ChargeReviewUiState;
  canCharge: boolean;
  onReview: () => void;
}

export function RoadLiabilityChargeReviewSection({
  ui,
  canCharge,
  onReview,
}: RoadLiabilityChargeReviewSectionProps) {
  const t = useTranslations("RoadLiabilities");

  if (ui.kind === "loading") {
    return (
      <section className={styles.card} data-testid="road-liability-charge-section">
        <p className={styles.section}>{t("charge.section")}</p>
        <p className={styles.note}>{t("charge.loading")}</p>
      </section>
    );
  }

  if (ui.kind === "gps_pending") {
    return (
      <section className={styles.card} data-testid="road-liability-charge-section" data-state="gps-pending">
        <p className={styles.section}>{t("charge.section")}</p>
        <p className={styles.note}>{t("charge.gpsPending")}</p>
      </section>
    );
  }

  if (ui.kind === "unmatched" || ui.kind === "ambiguous") return null;

  if (ui.kind === "locked") {
    const review = ui.review;
    const postClose = ui.destination === "POST_CLOSE_RECEIVABLE";
    return (
      <section
        className={styles.card}
        data-testid="road-liability-charge-section"
        data-state={postClose ? "post-close" : "attached"}
      >
        <p className={styles.section}>{t("charge.section")}</p>
        <p className={styles.lockBanner}>
          {postClose ? t("charge.postCloseCreated") : t("charge.added")}
        </p>
        {postClose ? (
          <p className={styles.note} data-testid="road-liability-post-close-badge">
            {t("charge.postCloseBadge")}
          </p>
        ) : null}
        {review ? (
          <div className={styles.rows}>
            <div className={styles.row}>
              <span>{t("charge.officialAmount")}</span>
              <b dir="ltr">{formatAed(review.officialAmount)}</b>
            </div>
            <div className={styles.row}>
              <span>{t("charge.additional")}</span>
              <b dir="ltr">{formatAed(review.adjustmentAmount ?? 0)}</b>
            </div>
            <div className={styles.row}>
              <span>{t("charge.customerCharge")}</span>
              <b dir="ltr" data-testid="road-liability-charge-locked-customer">
                {formatAed(review.customerChargeAmount ?? 0)}
              </b>
            </div>
          </div>
        ) : null}
        {review?.adjustmentReason ? (
          <p className={styles.reason}>
            {t("charge.reason")}: {review.adjustmentReason}
          </p>
        ) : null}
        <p className={styles.lockBanner}>{t("charge.lockedAmount")}</p>
      </section>
    );
  }

  if (ui.kind === "available" || ui.kind === "view_only") {
    const review = ui.review;
    return (
      <section
        className={styles.card}
        data-testid="road-liability-charge-section"
        data-state={ui.kind === "available" ? "available" : "view-only"}
      >
        <p className={styles.section}>{t("charge.section")}</p>
        {ui.destination === "POST_CLOSE_RECEIVABLE" ? (
          <p className={styles.note} data-testid="road-liability-charge-destination">
            {t("charge.destinationPostClose")}
          </p>
        ) : ui.destination === "RECONCILIATION" ? (
          <p className={styles.note} data-testid="road-liability-charge-destination">
            {t("charge.destinationReconciliation")}
          </p>
        ) : null}
        {review ? (
          <>
            <dl className={styles.officialPlate}>
              <dt>{t("charge.officialAmount")}</dt>
              <dd dir="ltr" data-testid="road-liability-charge-official">
                {formatAed(review.officialAmount)}
              </dd>
            </dl>
            <p className={styles.lockBanner}>{t("charge.officialHint")}</p>
            <div className={styles.row}>
              <span>{t("charge.suggested")}</span>
              <b dir="ltr">{formatAed(review.suggestedCustomerChargeAmount)}</b>
            </div>
          </>
        ) : null}
        {ui.kind === "available" && canCharge ? (
          <Button
            type="button"
            size="md"
            data-testid="road-liability-charge-review"
            onClick={onReview}
          >
            {t("charge.review")}
          </Button>
        ) : (
          <p className={styles.note}>{t("charge.viewOnly")}</p>
        )}
      </section>
    );
  }

  return (
    <section className={styles.card} data-testid="road-liability-charge-section" data-state="unavailable">
      <p className={styles.section}>{t("charge.section")}</p>
      <p className={styles.note}>{t("charge.unavailable")}</p>
    </section>
  );
}
