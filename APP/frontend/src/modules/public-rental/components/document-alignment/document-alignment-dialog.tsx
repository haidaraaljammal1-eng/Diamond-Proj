"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Icon } from "@/shared/components/ui/icon/icon";
import { readLicenseImageMeta } from "../../utils/read-license-image-meta";
import {
  DocumentAlignmentViewport,
  useAlignmentControls,
  useImageAdjustmentControls,
} from "./document-alignment-viewport";
import type {
  DocumentAlignmentKind,
  DocumentAlignmentTransform,
  ViewportSize,
} from "./document-alignment.types";
import { DEFAULT_ALIGNMENT_TRANSFORM } from "./document-alignment.types";
import { openTransformForDialog } from "./document-alignment-open-state";
import { exportAlignedDocument } from "./export-aligned-document";
import styles from "./document-alignment.module.css";

export interface DocumentAlignmentDialogProps {
  open: boolean;
  kind: DocumentAlignmentKind;
  file: File | null;
  /** When set, dialog opens with the user's last confirmed alignment for this source. */
  initialTransform?: DocumentAlignmentTransform | null;
  onClose: () => void;
  onConfirm: (file: File, transform: DocumentAlignmentTransform) => void | Promise<void>;
}

export function DocumentAlignmentDialog({
  open,
  kind,
  file,
  initialTransform = null,
  onClose,
  onConfirm,
}: DocumentAlignmentDialogProps) {
  const t = useTranslations("PublicRental.documentAlignment");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<DocumentAlignmentTransform>(DEFAULT_ALIGNMENT_TRANSFORM);
  const [resetTransform, setResetTransform] = useState<DocumentAlignmentTransform>(DEFAULT_ALIGNMENT_TRANSFORM);
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });
  const [compositionReady, setCompositionReady] = useState(false);
  const compositionInitializedRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const controls = useAlignmentControls(kind, transform, setTransform);
  const adjustments = useImageAdjustmentControls(transform, setTransform);

  useEffect(() => {
    if (!open || !file) return;
    let revoked: string | null = null;
    const url = URL.createObjectURL(file);
    revoked = url;
    setPreviewUrl(url);
    void readLicenseImageMeta(file).then((meta) => {
      setSourceSize({ width: meta.width, height: meta.height });
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
      setPreviewUrl(null);
      setSourceSize({ width: 0, height: 0 });
      setViewport({ width: 0, height: 0 });
      setCompositionReady(false);
      compositionInitializedRef.current = false;
    };
  }, [open, file, initialTransform]);

  useEffect(() => {
    if (!open || sourceSize.width <= 0 || viewport.width <= 0 || viewport.height <= 0) {
      setCompositionReady(false);
      return;
    }
    if (compositionInitializedRef.current) return;
    compositionInitializedRef.current = true;
    const next = openTransformForDialog(initialTransform, viewport, sourceSize);
    setTransform(next);
    setResetTransform(next);
    requestAnimationFrame(() => setCompositionReady(true));
  }, [
    open,
    kind,
    initialTransform,
    sourceSize.width,
    sourceSize.height,
    viewport.width,
    viewport.height,
  ]);

  const handleConfirm = async () => {
    if (!file || exporting || !compositionReady || viewport.width <= 0) return;
    setExporting(true);
    try {
      const exported = await exportAlignedDocument({
        kind,
        file,
        transform,
        viewport,
      });
      await onConfirm(exported, transform);
    } finally {
      setExporting(false);
    }
  };

  const handleReset = useCallback(() => {
    setTransform(resetTransform);
  }, [resetTransform]);

  const title = kind === "license" ? t("licenseTitle") : t("passportTitle");
  const description = kind === "license" ? t("licenseSubtitle") : t("passportSubtitle");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      closeLabel={t("cancel")}
      size="lg"
    >
      <div
        className={`${styles.dialogBody} ${exporting ? styles.exporting : ""}`}
        data-testid="document-alignment-dialog"
        data-kind={kind}
        data-composition-ready={compositionReady ? "true" : "false"}
      >
        {previewUrl && sourceSize.width > 0 ? (
          <DocumentAlignmentViewport
            kind={kind}
            previewUrl={previewUrl}
            sourceWidth={sourceSize.width}
            sourceHeight={sourceSize.height}
            transform={transform}
            onTransformChange={setTransform}
            onViewportSize={setViewport}
          />
        ) : null}

        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
              {t("reset")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={t("rotateLeft")}
              onClick={controls.rotateLeft}
            >
              <Icon name="mdi:rotate-left" size={18} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={t("rotateRight")}
              onClick={controls.rotateRight}
            >
              <Icon name="mdi:rotate-right" size={18} />
            </Button>
          </div>

          <div className={styles.adjustmentRow}>
            <span className={styles.adjustmentLabel}>
              <Icon name="mdi:magnify-plus-outline" size={18} aria-hidden />
              {t("zoomLabel")}
            </span>
            <div className={styles.adjustmentControls}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t("zoomOut")}
                onClick={controls.zoomOut}
              >
                <Icon name="mdi:minus" size={18} />
              </Button>
              <input
                type="range"
                className={styles.adjustmentSlider}
                min={controls.ZOOM_MIN}
                max={controls.ZOOM_MAX}
                step={0.01}
                value={transform.zoom}
                aria-label={t("zoomSlider")}
                onChange={(event) => controls.setZoom(Number(event.target.value))}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t("zoomIn")}
                onClick={controls.zoomIn}
              >
                <Icon name="mdi:plus" size={18} />
              </Button>
            </div>
          </div>

          <div className={styles.adjustmentRow}>
            <span className={styles.adjustmentLabel}>
              <Icon name="mdi:brightness-6" size={18} aria-hidden />
              {t("brightnessLabel", { percent: transform.brightnessPercent })}
            </span>
            <div className={styles.adjustmentControls}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t("brightnessDecrease")}
                onClick={adjustments.brightnessDown}
              >
                <Icon name="mdi:minus" size={18} />
              </Button>
              <input
                type="range"
                className={styles.adjustmentSlider}
                min={adjustments.ADJUSTMENT_MIN}
                max={adjustments.ADJUSTMENT_MAX}
                step={1}
                value={transform.brightnessPercent}
                aria-label={t("brightnessSlider", { percent: transform.brightnessPercent })}
                onChange={(event) => adjustments.setBrightness(Number(event.target.value))}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t("brightnessIncrease")}
                onClick={adjustments.brightnessUp}
              >
                <Icon name="mdi:plus" size={18} />
              </Button>
            </div>
          </div>

          <div className={styles.adjustmentRow}>
            <span className={styles.adjustmentLabel}>
              <Icon name="mdi:contrast-circle" size={18} aria-hidden />
              {t("contrastLabel", { percent: transform.contrastPercent })}
            </span>
            <div className={styles.adjustmentControls}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t("contrastDecrease")}
                onClick={adjustments.contrastDown}
              >
                <Icon name="mdi:minus" size={18} />
              </Button>
              <input
                type="range"
                className={styles.adjustmentSlider}
                min={adjustments.ADJUSTMENT_MIN}
                max={adjustments.ADJUSTMENT_MAX}
                step={1}
                value={transform.contrastPercent}
                aria-label={t("contrastSlider", { percent: transform.contrastPercent })}
                onChange={(event) => adjustments.setContrast(Number(event.target.value))}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={t("contrastIncrease")}
                onClick={adjustments.contrastUp}
              >
                <Icon name="mdi:plus" size={18} />
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <Button
            type="button"
            variant="secondary"
            size="md"
            data-testid="document-alignment-cancel"
            onClick={onClose}
            disabled={exporting}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            data-primary
            loading={exporting}
            data-testid="document-alignment-confirm"
            onClick={() => void handleConfirm()}
            disabled={!compositionReady || exporting}
          >
            {t("confirmUpload")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
