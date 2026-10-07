"use client";

import { useRef, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Icon } from "@/shared/components/ui/icon/icon";
import { LICENSE_ACCEPT } from "../../utils/license-file";
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
}: LicenseUploadProps) {
  const t = useTranslations("PublicRental.license");
  const copy = labels ?? {
    upload: t("upload"),
    replace: t("replace"),
    formats: t("formats"),
    previewAlt: t("previewAlt"),
  };
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  };

  const replaceOnly = variant === "replaceAction";

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
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={pending}
          disabled={disabled || pending}
          data-testid={testId ? `${testId}-replace` : undefined}
          onClick={() => inputRef.current?.click()}
        >
          {previewUrl || replaceOnly ? copy.replace : copy.upload}
        </Button>
      </div>
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept={LICENSE_ACCEPT}
        capture="environment"
        disabled={disabled || pending}
        onChange={handleChange}
        aria-label={copy.upload}
      />
    </div>
  );
}
