"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { Chip } from "@/shared/components/ui/chip";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
import { VehicleStatus } from "@/modules/vehicles/components/vehicle-status/vehicle-status";
import type { GpsVehicleListItemDto } from "../../types/gps.types";
import {
  displayMotionStatusFromGpsLocation,
  hasMapCoordinates,
  toValidGpsDate,
  trackingChipTone,
} from "../../utils/gps-status";
import styles from "./gps-vehicle-row.module.css";

export interface GpsVehicleRowProps {
  item: GpsVehicleListItemDto;
  selected: boolean;
  now: Date;
  onViewDetails: (vehicleId: number) => void;
  onShowOnMap: (vehicleId: number) => void;
}

export function GpsVehicleRow({
  item,
  selected,
  now,
  onViewDetails,
  onShowOnMap,
}: GpsVehicleRowProps) {
  const t = useTranslations("Gps");
  const format = useFormatter();
  const vehicle = item.vehicle;
  const gps = item.gps;
  const plate = vehicle.plateNumber?.trim() || t("gpsVehicle");
  const captured = toValidGpsDate(gps.capturedAt);
  const displayMotionStatus = displayMotionStatusFromGpsLocation(gps, now);
  const canShowOnMap = hasMapCoordinates(gps.latitude, gps.longitude);

  function onMainKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onViewDetails(vehicle.id);
    }
  }

  function onMapClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!canShowOnMap) return;
    onShowOnMap(vehicle.id);
  }

  function onDetailsClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onViewDetails(vehicle.id);
  }

  return (
    <div
      className={[styles.row, selected ? styles.selected : ""].filter(Boolean).join(" ")}
      data-testid="gps-vehicle-row"
      data-vehicle-id={vehicle.id}
    >
      <button
        type="button"
        className={styles.main}
        onClick={() => onViewDetails(vehicle.id)}
        onKeyDown={onMainKeyDown}
        aria-pressed={selected}
      >
        <VehicleImage
          path={vehicle.primaryImageUrl}
          alt=""
          className={styles.photo}
        />
        <div className={styles.body}>
          <div className={styles.identityRow}>
            <p className={styles.name}>{vehicle.displayName}</p>
            <CompanyIdentity company={vehicle.company} compact />
          </div>
          <p className={styles.meta}>
            <span dir="ltr">{plate}</span>
            {captured ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{format.relativeTime(captured, now)}</span>
              </>
            ) : (
              <>
                <span aria-hidden="true"> · </span>
                <span>{t("noUpdate")}</span>
              </>
            )}
          </p>
          <div className={styles.chips}>
            <Chip tone={trackingChipTone(displayMotionStatus)} dot>
              {t(`status.${displayMotionStatus}`)}
            </Chip>
            <VehicleStatus
              status={vehicle.operationalStatus}
              currentRentalStatus={item.currentRental?.status ?? null}
            />
          </div>
          {item.currentRental ? (
            <p className={styles.rental}>
              {item.currentRental.customerName}
              <span aria-hidden="true"> · </span>
              <span dir="ltr">{item.currentRental.contractNumber}</span>
            </p>
          ) : null}
        </div>
      </button>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={styles.mapAction}
          data-testid="gps-row-show-map"
          disabled={!canShowOnMap}
          title={!canShowOnMap ? t("row.mapUnavailable") : undefined}
          onClick={onMapClick}
        >
          <Icon name="mdi:map-marker-radius" size={16} />
          {t("row.showOnMap")}
        </Button>
        <Button
          type="button"
          variant="secondaryStrong"
          size="sm"
          className={styles.detailsAction}
          data-testid="gps-row-view-details"
          onClick={onDetailsClick}
        >
          <Icon name="mdi:eye-outline" size={16} />
          {t("row.viewDetails")}
        </Button>
      </div>
    </div>
  );
}
