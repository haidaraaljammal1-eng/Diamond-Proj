"use client";

import { Dialog } from "@/shared/components/ui/dialog";
import { VehicleImage } from "../vehicle-image/vehicle-image";
import styles from "./vehicle-photo-preview-dialog.module.css";

export interface VehiclePhotoPreviewDialogProps {
  open: boolean;
  title: string;
  closeLabel: string;
  imageUrl: string | null;
  imageAlt: string;
  onClose: () => void;
}

export function VehiclePhotoPreviewDialog({
  open,
  title,
  closeLabel,
  imageUrl,
  imageAlt,
  onClose,
}: VehiclePhotoPreviewDialogProps) {
  return (
    <Dialog open={open && imageUrl != null} onClose={onClose} title={title} closeLabel={closeLabel} size="xl">
      {imageUrl ? (
        <div className={styles.frame}>
          <VehicleImage path={imageUrl} alt={imageAlt} className={styles.image} />
        </div>
      ) : null}
    </Dialog>
  );
}
