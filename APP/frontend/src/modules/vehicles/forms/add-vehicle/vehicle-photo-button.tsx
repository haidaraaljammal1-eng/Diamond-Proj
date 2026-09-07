"use client";

import { useRef } from "react";
import { Button, type ButtonProps } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import {
  isAcceptedVehiclePhotoFile,
  VEHICLE_PHOTO_ACCEPT,
} from "./vehicle-photo-picker.utils";
import styles from "./vehicle-photo-button.module.css";

export interface VehiclePhotoButtonProps {
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  loading?: boolean;
  iconName?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  onFileSelected: (file: File) => void;
}

/** One hidden file input + one Shared Button. Styling comes from Shared variants. */
export function VehiclePhotoButton({
  label,
  ariaLabel,
  disabled = false,
  loading = false,
  iconName = "mdi:image-plus",
  variant = "secondary",
  size = "md",
  onFileSelected,
}: VehiclePhotoButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={VEHICLE_PHOTO_ACCEPT}
        className={styles.hiddenInput}
        disabled={disabled || loading}
        aria-label={ariaLabel}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (!selected || !isAcceptedVehiclePhotoFile(selected)) return;
          onFileSelected(selected);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        loading={loading}
        onClick={() => inputRef.current?.click()}
      >
        <Icon name={iconName} size={16} />
        {label}
      </Button>
    </>
  );
}
