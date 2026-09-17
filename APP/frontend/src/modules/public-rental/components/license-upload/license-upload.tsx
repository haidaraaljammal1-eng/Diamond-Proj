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
  onFile: (file: File) => void;
}

export function LicenseUpload({
  previewUrl,
  pending,
  disabled = false,
  labels,
  icon = "mdi:card-account-details-outline",
  testId,
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

  return (
    <div className={styles.drop} data-testid={testId}>
      <Icon name={icon} size={28} />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={previewUrl} alt={copy.previewAlt} className={styles.preview} />
      ) : null}
      <p className={styles.hint}>{copy.formats}</p>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={pending}
          disabled={disabled || pending}
          onClick={() => inputRef.current?.click()}
        >
          {previewUrl ? copy.replace : copy.upload}
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
