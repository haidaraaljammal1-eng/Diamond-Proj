"use client";

import type { KeyboardEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Chip } from "@/shared/components/ui/chip";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
import { VehicleStatus } from "@/modules/vehicles/components/vehicle-status/vehicle-status";
import type { GpsVehicleListItemDto } from "../../types/gps.types";
import { toValidGpsDate, trackingChipTone } from "../../utils/gps-status";
import styles from "./gps-vehicle-row.module.css";

export interface GpsVehicleRowProps {
  item: GpsVehicleListItemDto;
  selected: boolean;
  now: Date;
  onSelect: (vehicleId: number) => void;
}

export function GpsVehicleRow({ item, selected, now, onSelect }: GpsVehicleRowProps) {
  const t = useTranslations("Gps");
  const format = useFormatter();
  const vehicle = item.vehicle;
  const gps = item.gps;
  const plate = vehicle.plateNumber?.trim() || t("noPlate");
  const captured = toValidGpsDate(gps.capturedAt);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(vehicle.id);
    }
  }

  return (
    <button
      type="button"
      className={[styles.row, selected ? styles.selected : ""].filter(Boolean).join(" ")}
      onClick={() => onSelect(vehicle.id)}
      onKeyDown={onKeyDown}
      aria-pressed={selected}
      data-testid="gps-vehicle-row"
      data-vehicle-id={vehicle.id}
    >
      <VehicleImage
        path={vehicle.primaryImageUrl}
        alt=""
        className={styles.photo}
      />
      <div className={styles.body}>
        <p className={styles.name}>{vehicle.displayName}</p>
        <p className={styles.meta}>
          <span dir="ltr">{plate}</span>
          {captured ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>
                {format.relativeTime(captured, now)}
              </span>
            </>
          ) : (
            <>
              <span aria-hidden="true"> · </span>
              <span>{t("noUpdate")}</span>
            </>
          )}
        </p>
        <div className={styles.chips}>
          <Chip tone={trackingChipTone(gps.trackingStatus)} dot>
            {t(`status.${gps.trackingStatus}`)}
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
  );
}
