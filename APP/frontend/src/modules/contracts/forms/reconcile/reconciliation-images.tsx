"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { ContractInspectionImage } from "../../components/contract-inspection-image/contract-inspection-image";
import type {
  FullReconciliationReadDto,
  ReconciliationPreviewImage,
} from "../../types/reconciliation.types";
import { custodyAngleLabelKey, flattenImagePairs } from "../../utils/reconciliation.utils";
import { RECONCILIATION_SECTION_IDS } from "./reconciliation-sections";
import styles from "./reconcile-dialog.module.css";

function angleLabel(t: ReturnType<typeof useTranslations<"Contracts">>, angle: string): string {
  const key = custodyAngleLabelKey(angle);
  return t.has(key as never) ? t(key as never) : angle;
}

export function ReconciliationImagePairsSection({
  pairs,
  onPreview,
}: {
  pairs: FullReconciliationReadDto["imagePairs"];
  onPreview?: (image: ReconciliationPreviewImage) => void;
}) {
  const t = useTranslations("Contracts");
  if (pairs.length === 0) return null;

  return (
    <section
      id={RECONCILIATION_SECTION_IDS.photos}
      className={styles.section}
      data-testid="reconciliation-image-pairs"
    >
      <h3 className={styles.sectionTitle}>{t("finalReconciliation.imageComparison")}</h3>
      <ul className={styles.angleGrid}>
        {pairs.map((pair) => (
          <li key={pair.angle} className={styles.angleCell} data-testid={`image-pair-${pair.angle}`}>
            <p className={styles.pairAngle}>{angleLabel(t, pair.angle)}</p>
            <div className={styles.pairCompareHeader} aria-hidden="true">
              <span className={styles.stageLabelOut}>{t("finalReconciliation.carOut")}</span>
              <span className={styles.stageLabelIn}>{t("finalReconciliation.carIn")}</span>
            </div>
            <div className={styles.pairCompare}>
              <ImageThumb
                label={t("finalReconciliation.carOut")}
                photo={pair.outPhoto}
                angle={pair.angle}
                stage="OUT"
                onPreview={onPreview}
              />
              <ImageThumb
                label={t("finalReconciliation.carIn")}
                photo={pair.inPhoto}
                angle={pair.angle}
                stage="IN"
                onPreview={onPreview}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ImageThumb({
  label,
  photo,
  angle,
  stage,
  onPreview,
}: {
  label: string;
  photo: { id: string; url: string } | null;
  angle: string;
  stage: "OUT" | "IN";
  onPreview?: (image: ReconciliationPreviewImage) => void;
}) {
  const t = useTranslations("Contracts");
  const stageClass = stage === "OUT" ? styles.thumbButtonOut : styles.thumbButtonIn;

  if (!photo) {
    return (
      <div className={styles.thumbMissing} data-testid={`image-missing-${stage}-${angle}`}>
        <span className={styles.stageLabel}>{label}</span>
        <p>{t("finalReconciliation.missingPhoto")}</p>
      </div>
    );
  }

  const image = (
    <ContractInspectionImage path={photo.url} alt={`${label} ${angle}`} className={styles.thumbImage} />
  );

  if (!onPreview) {
    return (
      <div className={stageClass}>
        <span className={styles.stageLabel}>{label}</span>
        {image}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={stageClass}
      data-testid={`image-thumb-${stage}-${angle}`}
      aria-label={`${label} — ${angleLabel(t, angle)}`}
      onClick={() => onPreview({ id: photo.id, url: photo.url, angle, stage })}
    >
      <span className={styles.stageLabel}>{label}</span>
      {image}
    </button>
  );
}

export function ReconciliationImagePreviewDialog({
  pairs,
  active,
  onClose,
  onNavigate,
}: {
  pairs: FullReconciliationReadDto["imagePairs"];
  active: ReconciliationPreviewImage | null;
  onClose: () => void;
  onNavigate: (image: ReconciliationPreviewImage) => void;
}) {
  const t = useTranslations("Contracts");
  const images = useMemo(() => flattenImagePairs(pairs), [pairs]);
  const activeIndex = active ? images.findIndex((item) => item.id === active.id) : -1;
  const previous = activeIndex > 0 ? images[activeIndex - 1] : null;
  const next = activeIndex >= 0 && activeIndex < images.length - 1 ? images[activeIndex + 1] : null;
  if (!active) return null;

  return (
    <Dialog
      open={active != null}
      onClose={onClose}
      title={t("finalReconciliation.imagePreview")}
      closeLabel={t("detail.close")}
      size="xl"
    >
      <div className={styles.previewMeta}>
        <span>{active.stage === "OUT" ? t("finalReconciliation.carOut") : t("finalReconciliation.carIn")}</span>
        <span aria-hidden="true">·</span>
        <span>{angleLabel(t, active.angle)}</span>
      </div>
      <ContractInspectionImage path={active.url} alt={active.angle} className={styles.previewImage} />
      <div className={styles.previewNav}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!previous}
          onClick={() => previous && onNavigate(previous)}
        >
          {t("finalReconciliation.previousImage")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!next}
          onClick={() => next && onNavigate(next)}
        >
          {t("finalReconciliation.nextImage")}
        </Button>
      </div>
    </Dialog>
  );
}
