"use client";

import { useRef, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Icon } from "@/shared/components/ui/icon/icon";
import { LICENSE_ACCEPT } from "../../utils/license-file";
import {
  documentCameraInputAttributes,
  readCameraCaptureFile,
} from "../../utils/document-alignment-source";
import styles from "./license-upload.module.css";

export interface DocumentCaptureLabels {
  upload: string;
  replace: string;
  formats: string;
  previewAlt: string;
}

interface LicenseUploadProps {
  previewUrl: string | null;
  pending: boolean;
  disabled?: boolean;
  /** Defaults to the driving-license copy; the passport step passes its own. */
  labels?: DocumentCaptureLabels;
  icon?: string;
  testId?: string;
  /** When false, preview is shown elsewhere (e.g. verified panel) but replace label still applies. */
  showPreview?: boolean;
  /** After verification: replace button only, directly under document preview. */
  variant?: "dropzone" | "replaceAction";
  onFile: (file: File) => void;
  onEditCurrent?: () => void;
  editCurrentLabel?: string;
  editCurrentTestId?: string;
  cameraLabel: string;
  cameraTestId?: string;
}

export function LicenseUpload({
  previewUrl,
  pending,
  disabled = false,
  labels,
  icon = "mdi:card-account-details-outline",
  testId,
  showPreview = true,
  variant = "dropzone",
  onFile,
  onEditCurrent,
  editCurrentLabel,
  editCurrentTestId,
  cameraLabel,
  cameraTestId,
}: LicenseUploadProps) {
  const t = useTranslations("PublicRental.license");
  const copy = labels ?? {
    upload: t("upload"),
    replace: t("replace"),
    formats: t("formats"),
    previewAlt: t("previewAlt"),
  };
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraAttrs = documentCameraInputAttributes();

  const deliverFile = (file: File) => {
    onFile(file);
  };

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) deliverFile(file);
  };

  const handleCameraChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = readCameraCaptureFile(event.target.files);
    event.target.value = "";
    if (file) deliverFile(file);
  };

  const replaceOnly = variant === "replaceAction";
  const hasExistingDocument = Boolean(previewUrl) || replaceOnly;

  return (
    <div
      className={replaceOnly ? styles.replaceAction : styles.drop}
      data-testid={testId}
      data-variant={variant}
    >
      {replaceOnly ? null : <Icon name={icon} size={28} />}
      {showPreview && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img
          src={previewUrl}
          alt={copy.previewAlt}
          className={styles.preview}
          data-testid={testId ? `${testId}-preview` : undefined}
        />
      ) : null}
      {replaceOnly ? null : <p className={styles.hint}>{copy.formats}</p>}
      <div className={styles.actions}>
        {replaceOnly && onEditCurrent && editCurrentLabel ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={disabled || pending}
            data-testid={editCurrentTestId}
            onClick={onEditCurrent}
          >
            {editCurrentLabel}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={pending}
          disabled={disabled || pending}
          data-testid={testId ? `${testId}-replace` : undefined}
          onClick={() => uploadInputRef.current?.click()}
        >
          {hasExistingDocument ? copy.replace : copy.upload}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={disabled || pending}
          data-testid={cameraTestId ?? (testId ? `${testId}-camera` : undefined)}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Icon name="mdi:camera-outline" size={18} aria-hidden />
          {cameraLabel}
        </Button>
      </div>
      <input
        ref={uploadInputRef}
        className={styles.hiddenInput}
        type="file"
        accept={LICENSE_ACCEPT}
        disabled={disabled || pending}
        onChange={handleUploadChange}
        aria-label={hasExistingDocument ? copy.replace : copy.upload}
        data-testid={testId ? `${testId}-upload-input` : undefined}
      />
      <input
        ref={cameraInputRef}
        className={styles.hiddenInput}
        type="file"
        accept={cameraAttrs.accept}
        capture={cameraAttrs.capture}
        disabled={disabled || pending}
        onChange={handleCameraChange}
        aria-label={cameraLabel}
        data-testid={testId ? `${testId}-camera-input` : undefined}
      />
    </div>
  );
}
