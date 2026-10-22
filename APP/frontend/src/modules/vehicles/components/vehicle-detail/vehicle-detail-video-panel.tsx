"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { accessVehicleVideoPlayback } from "../../api/vehicles.api";
import { VehiclePhotoButton } from "../../forms/add-vehicle/vehicle-photo-button";
import { VEHICLE_VIDEO_ACCEPT } from "../../forms/add-vehicle/vehicle-video.constants";
import type { VehicleVideoDto } from "../../types/vehicle.types";
import { resolveVehicleMediaUrl } from "../../utils/vehicle-image-url";
import styles from "./vehicle-detail-video-panel.module.css";

export interface VehicleDetailVideoPanelProps {
  vehicleId: number;
  video: VehicleVideoDto | null;
  canManage: boolean;
  isActionPending: boolean;
  onUploadVideo: (file: File) => void;
  onDeleteVideo: () => void;
}

export function VehicleDetailVideoPanel({
  vehicleId,
  video,
  canManage,
  isActionPending,
  onUploadVideo,
  onDeleteVideo,
}: VehicleDetailVideoPanelProps) {
  const t = useTranslations("Vehicles");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setPlaybackUrl(null);
    setPlaybackError(false);
  }, [video?.id, vehicleId]);

  const requestPlayback = useCallback(async () => {
    if (!video) return;
    setPlaybackLoading(true);
    setPlaybackError(false);
    try {
      const access = await accessVehicleVideoPlayback(vehicleId);
      setPlaybackUrl(resolveVehicleMediaUrl(access.streamUrl));
      window.requestAnimationFrame(() => {
        videoRef.current?.play().catch(() => undefined);
      });
    } catch {
      setPlaybackError(true);
    } finally {
      setPlaybackLoading(false);
    }
  }, [vehicleId, video]);

  const durationLabel =
    video != null
      ? t("detail.videoDuration", { seconds: Math.round(video.durationSec) })
      : null;

  return (
    <div className={styles.panel} data-testid="vehicle-detail-video-panel">
      <p className={styles.kicker}>{t("detail.videoTitle")}</p>

      {video && playbackUrl ? (
        <video
          ref={videoRef}
          className={styles.player}
          controls
          preload="metadata"
          src={playbackUrl}
          data-testid="vehicle-detail-video-player"
        />
      ) : (
        <div className={styles.placeholder} data-testid="vehicle-detail-video-placeholder">
          <div className={styles.placeholderIcon} aria-hidden="true">
            <Icon name="mdi:video-outline" size={28} />
          </div>
          {video ? (
            <>
              <p className={styles.placeholderHint}>{durationLabel}</p>
              <Button
                type="button"
                variant="secondaryStrong"
                size="sm"
                disabled={playbackLoading || isActionPending}
                onClick={() => void requestPlayback()}
                data-testid="vehicle-detail-video-play"
              >
                <Icon name="mdi:play-circle-outline" size={18} />
                {playbackLoading ? t("detail.videoLoading") : t("detail.videoPlay")}
              </Button>
              {playbackError ? (
                <p className={styles.errorText}>{t("detail.videoPlaybackError")}</p>
              ) : null}
            </>
          ) : (
            <p className={styles.placeholderHint}>{t("detail.videoEmpty")}</p>
          )}
        </div>
      )}

      {canManage ? (
        <div className={styles.actions}>
          <VehiclePhotoButton
            label={video ? t("detail.videoReplace") : t("detail.videoUpload")}
            ariaLabel={video ? t("detail.videoReplace") : t("detail.videoUpload")}
            variant="secondary"
            size="sm"
            disabled={isActionPending}
            loading={isActionPending}
            iconName={video ? "mdi:video-switch" : "mdi:video-plus-outline"}
            onFileSelected={onUploadVideo}
            accept={VEHICLE_VIDEO_ACCEPT}
            validateFile={(file) => file.type === VEHICLE_VIDEO_ACCEPT}
          />
          {video ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isActionPending}
              aria-label={t("detail.videoRemove")}
              onClick={onDeleteVideo}
              data-testid="vehicle-detail-video-delete"
            >
              <Icon name="mdi:trash-can-outline" size={16} />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
