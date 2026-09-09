"use client";

import { useRef, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Icon } from "@/shared/components/ui/icon/icon";
import { LICENSE_ACCEPT } from "../../utils/license-file";
import styles from "./license-upload.module.css";

interface LicenseUploadProps {
  previewUrl: string | null;
  pending: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}

export function LicenseUpload({
  previewUrl,
  pending,
  disabled = false,
  onFile,
}: LicenseUploadProps) {
  const t = useTranslations("PublicRental.license");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  };

  return (
    <div className={styles.drop}>
      <Icon name="mdi:card-account-details-outline" size={28} />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={previewUrl} alt={t("previewAlt")} className={styles.preview} />
      ) : null}
      <p className={styles.hint}>{t("formats")}</p>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={pending}
          disabled={disabled || pending}
          onClick={() => inputRef.current?.click()}
        >
          {previewUrl ? t("replace") : t("upload")}
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
        aria-label={t("upload")}
      />
    </div>
  );
}
