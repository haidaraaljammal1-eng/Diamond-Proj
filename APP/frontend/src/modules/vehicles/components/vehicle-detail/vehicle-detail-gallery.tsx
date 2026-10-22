"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { VehiclePhotoButton } from "../../forms/add-vehicle/vehicle-photo-button";
import { VEHICLE_GALLERY_MAX_PHOTOS } from "../../forms/add-vehicle/vehicle-photo.constants";
import type { VehicleImageDto } from "../../types/vehicle.types";
import { VehicleImage } from "../vehicle-image/vehicle-image";
import { VehiclePhotoPreviewDialog } from "./vehicle-photo-preview-dialog";
import styles from "./vehicle-detail-gallery.module.css";

export interface VehicleDetailGalleryProps {
  vehicleName: string;
  gallery: VehicleImageDto[];
  canManage: boolean;
  canShareWhatsApp: boolean;
  isPhotoActionPending: boolean;
  onUploadPhoto: (file: File) => void;
  onReplacePhoto: (photoId: string, file: File) => void;
  onDeletePhoto: (photoId: string) => void;
  onShareWhatsApp: () => void;
}

export function VehicleDetailGallery({
  vehicleName,
  gallery,
  canManage,
  canShareWhatsApp,
  isPhotoActionPending,
  onUploadPhoto,
  onReplacePhoto,
  onDeletePhoto,
  onShareWhatsApp,
}: VehicleDetailGalleryProps) {
  const t = useTranslations("Vehicles");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const photos = useMemo(
    () => [...gallery].sort((a, b) => a.sortOrder - b.sortOrder),
    [gallery],
  );

  const slots = useMemo(() => {
    const filled: Array<VehicleImageDto | null> = photos.slice(0, VEHICLE_GALLERY_MAX_PHOTOS);
    while (filled.length < VEHICLE_GALLERY_MAX_PHOTOS) filled.push(null);
    return filled;
  }, [photos]);

  return (
    <section className={styles.section} aria-labelledby="vehicle-detail-gallery-title">
      <div className={styles.sectionHead}>
        <p id="vehicle-detail-gallery-title" className={styles.sectionTitle}>
          {t("detail.galleryTitle")}
        </p>
      </div>

      <div className={styles.galleryLayout}>
      <div className={styles.grid} data-testid="vehicle-detail-gallery">
        {slots.map((photo, index) => (
          <article
            key={photo?.id ?? `slot-${index}`}
            className={styles.slot}
            data-testid={`vehicle-detail-gallery-slot-${index}`}
          >
            {photo ? (
              <>
                <button
                  type="button"
                  className={styles.previewButton}
                  onClick={() => setPreviewUrl(photo.url)}
                  aria-label={t("detail.galleryItem", { name: vehicleName })}
                >
                  <VehicleImage path={photo.url} alt={vehicleName} className={styles.previewImage} />
                </button>
                {canManage ? (
                  <div className={styles.slotActions}>
                    <VehiclePhotoButton
                      label={t("detail.galleryReplacePhoto")}
                      ariaLabel={t("detail.galleryReplacePhoto")}
                      variant="secondary"
                      size="sm"
                      disabled={isPhotoActionPending}
                      loading={isPhotoActionPending}
                      iconName="mdi:image-edit-outline"
                      onFileSelected={(file) => onReplacePhoto(photo.id, file)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isPhotoActionPending}
                      aria-label={t("detail.galleryRemovePhoto")}
                      onClick={() => onDeletePhoto(photo.id)}
                    >
                      <Icon name="mdi:trash-can-outline" size={16} />
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.emptySlot}>
                <div className={styles.emptyVisual} aria-hidden="true">
                  <Icon name="mdi:image-outline" size={22} />
                </div>
                {canManage ? (
                  <VehiclePhotoButton
                    label={t("detail.galleryAddPhoto")}
                    ariaLabel={t("detail.galleryAddPhoto")}
                    variant="secondaryStrong"
                    size="sm"
                    disabled={isPhotoActionPending || photos.length >= VEHICLE_GALLERY_MAX_PHOTOS}
                    loading={isPhotoActionPending}
                    iconName="mdi:image-plus"
                    onFileSelected={onUploadPhoto}
                  />
                ) : (
                  <span className={styles.emptyLabel}>{t("detail.noPhoto")}</span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      <div className={styles.whatsAppRow}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canShareWhatsApp || photos.length === 0 || isPhotoActionPending}
          data-testid="vehicle-detail-whatsapp-share"
          onClick={onShareWhatsApp}
        >
          <Icon name="mdi:whatsapp" size={18} />
          {t("detail.shareWhatsApp")}
        </Button>
      </div>
      </div>

      <VehiclePhotoPreviewDialog
        open={previewUrl != null}
        title={t("detail.galleryPreviewTitle")}
        closeLabel={t("detail.close")}
        imageUrl={previewUrl}
        imageAlt={vehicleName}
        onClose={() => setPreviewUrl(null)}
      />
    </section>
  );
}
