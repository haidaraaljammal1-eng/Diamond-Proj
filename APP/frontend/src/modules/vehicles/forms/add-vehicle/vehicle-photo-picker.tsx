"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import {
  isAcceptedVehiclePhotoFile,
  resolvePhotoPickerButtonKey,
  VEHICLE_PHOTO_ACCEPT,
} from "./vehicle-photo-picker.utils";
import styles from "./vehicle-photo-picker.module.css";

export interface VehiclePhotoPickerProps {
  file: File | null;
  onFileChange: (file: File) => void;
  disabled?: boolean;
}

export function VehiclePhotoPicker({
  file,
  onFileChange,
  disabled = false,
}: VehiclePhotoPickerProps) {
  const t = useTranslations("Vehicles");
  const inputRef = useRef<HTMLInputElement>(null);
  const liveUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const buttonKey = resolvePhotoPickerButtonKey(file != null);
  const buttonLabel = t(`form.${buttonKey}`);

  useEffect(() => {
    return () => {
      if (liveUrlRef.current) {
        URL.revokeObjectURL(liveUrlRef.current);
        liveUrlRef.current = null;
      }
    };
  }, []);

  return (
    <div className={styles.root}>
      <p className={styles.label}>{t("form.vehiclePhotoLabel")}</p>
      <div className={styles.row}>
        <input
          ref={inputRef}
          type="file"
          accept={VEHICLE_PHOTO_ACCEPT}
          className={styles.hiddenInput}
          disabled={disabled}
          aria-label={buttonLabel}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (!selected || !isAcceptedVehiclePhotoFile(selected)) return;
            if (liveUrlRef.current) {
              URL.revokeObjectURL(liveUrlRef.current);
              liveUrlRef.current = null;
            }
            const url = URL.createObjectURL(selected);
            liveUrlRef.current = url;
            setPreviewBroken(false);
            setPreviewUrl(url);
            onFileChange(selected);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="mdi:image-plus" size={16} />
          {buttonLabel}
        </Button>
        {file && previewUrl && !previewBroken ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview before upload
          <img
            src={previewUrl}
            alt=""
            className={styles.preview}
            onError={(event) => {
              if (event.currentTarget.src === liveUrlRef.current) {
                setPreviewBroken(true);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
