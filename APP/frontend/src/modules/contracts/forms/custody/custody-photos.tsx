"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { ContractInspectionImage } from "../../components/contract-inspection-image/contract-inspection-image";
import type { CarOutAngle } from "../../types/contract.types";
import styles from "./custody-dialog.module.css";

export interface CustodyPhotoSlot {
  id: string;
  angle: string;
  url: string;
}

export interface CustodyPhotoGridProps {
  /** Message namespace of this custody side, e.g. `Contracts.carOut` or `Contracts.carIn`. */
  namespace: string;
  /** Prefix of the ledger scroll targets, e.g. `car-in` → `car-in-target-FRONT`. */
  idPrefix: string;
  required: readonly CarOutAngle[];
  optional: readonly CarOutAngle[];
  photos: CustodyPhotoSlot[];
  progress: { required: number; completed: number };
  editable: boolean;
  canUpload: boolean;
  canDelete: boolean;
  pending: boolean;
  onUpload: (angle: CarOutAngle, file: File) => void;
  onDelete: (photoId: string) => void;
}

/**
 * Step 2 of a custody event: the same walk-around photo slots for OUT and IN —
 * camera capture, gallery upload, replace and delete, with saved slots restored
 * from the server on reopen.
 */
export function CustodyPhotoGrid({ namespace, idPrefix, required, optional, photos, progress, editable, canUpload, canDelete, pending, onUpload, onDelete }: CustodyPhotoGridProps) {
  const t = useTranslations(namespace);
  const captureInputs = useRef<Partial<Record<CarOutAngle, HTMLInputElement | null>>>({});
  const uploadInputs = useRef<Partial<Record<CarOutAngle, HTMLInputElement | null>>>({});
  const angleLabel = (angle: CarOutAngle) => t(`angle.${angle}`);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h4>{t("photosTitle")}</h4>
        <strong className={styles.progress}>{t("progress", { completed: progress.completed, required: progress.required })}</strong>
      </div>
      <p className={styles.help}>{t("photosHint")}</p>
      <div className={styles.progressTrack}>
        <span style={{ width: `${progress.required ? Math.round((100 * progress.completed) / progress.required) : 0}%` }} />
      </div>
      <div className={styles.photoGrid}>
        {[...required, ...optional].map((angle) => {
          const photo = photos.find((item) => item.angle === angle);
          return (
            <div className={styles.photoSlot} key={angle} id={`${idPrefix}-target-${angle}`} tabIndex={-1}>
              <div className={styles.photoHeading}>
                <strong>{angleLabel(angle)}</strong>
                <small>{required.includes(angle) ? t("required") : t("optional")}</small>
              </div>
              {photo ? <ContractInspectionImage path={photo.url} alt={angleLabel(angle)} className={styles.thumbnail} /> : <div className={styles.placeholder}>{t("notCaptured")}</div>}
              {editable && canUpload ? (
                <div className={styles.photoActions}>
                  <input ref={(node) => { captureInputs.current[angle] = node; }} type="file" accept="image/*" capture="environment" tabIndex={-1} className={styles.fileInput} aria-label={angleLabel(angle)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(angle, file); }} />
                  <input ref={(node) => { uploadInputs.current[angle] = node; }} type="file" accept="image/*" tabIndex={-1} className={styles.fileInput} aria-label={`${t("upload")} ${angleLabel(angle)}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(angle, file); }} />
                  <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => captureInputs.current[angle]?.click()}>{photo ? t("retake") : t("capture")}</Button>
                  <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => uploadInputs.current[angle]?.click()}>{photo ? t("replacePhoto") : t("upload")}</Button>
                  {photo && canDelete ? <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => onDelete(photo.id)}>{t("delete")}</Button> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
