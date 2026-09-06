"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import type { VehicleCardDto } from "../../types/vehicle.types";
import {
  shouldShowCurrentRental,
  shouldShowRentalTimer,
} from "../../utils/rental-timer";
import { VehicleImage } from "../vehicle-image/vehicle-image";
import { VehicleRentalTimer } from "../vehicle-rental-timer/vehicle-rental-timer";
import { VehicleStatus } from "../vehicle-status/vehicle-status";
import styles from "./vehicle-card.module.css";

export interface VehicleCardProps {
  vehicle: VehicleCardDto;
  onOpen: (vehicle: VehicleCardDto) => void;
  onSetPrice: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onGps: (vehicle: VehicleCardDto) => void;
  onMore: (vehicle: VehicleCardDto) => void;
}

function stopOpen(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

export function VehicleCard({
  vehicle,
  onOpen,
  onSetPrice,
  onPrimaryAction,
  onGps,
  onMore,
}: VehicleCardProps) {
  const t = useTranslations("Vehicles");
  const format = useFormatter();
  const showRenter = shouldShowCurrentRental(
    vehicle.operationalStatus,
    vehicle.currentRental,
  );
  const showTimer = shouldShowRentalTimer(
    vehicle.operationalStatus,
    vehicle.currentRental,
  );

  const primaryLabel =
    vehicle.operationalStatus === "service"
      ? t("actions.goMaintenance")
      : vehicle.operationalStatus === "rented"
        ? t("actions.generateReturnLink")
        : t("actions.generateLinkSetPrice");

  return (
    <Card
      interactive
      padding="none"
      className={styles.card}
      data-testid="vehicle-card"
      onClick={() => onOpen(vehicle)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(vehicle);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={vehicle.displayName}
    >
      <div className={styles.photo}>
        <VehicleImage
          path={vehicle.primaryImage?.url}
          alt={vehicle.displayName}
          className={styles.image}
        />
        <VehicleStatus status={vehicle.operationalStatus} className={styles.status} />
      </div>

      <div className={styles.body}>
        <h4 className={styles.title}>{vehicle.displayName}</h4>
        <div className={styles.meta}>
          {vehicle.modelYear != null ? (
            <span className={styles.metaItem}>{format.number(vehicle.modelYear)}</span>
          ) : null}
          {vehicle.plateNumber ? (
            <span className={styles.metaItem} dir="ltr">{vehicle.plateNumber}</span>
          ) : null}
          {vehicle.color ? <span className={styles.metaItem}>{vehicle.color}</span> : null}
        </div>
        {showRenter ? (
          <p className={styles.renter}>
            {t("currentRenter", { name: vehicle.currentRental!.customerName })}
          </p>
        ) : null}
      </div>

      <div className={styles.rate}>
        <b>{format.number(vehicle.dailyRate ?? 0)}</b>
        <span>{t("dailyRateSuffix")}</span>
        <span className={styles.monthly}>
          {format.number(vehicle.monthlyRate ?? 0)} {t("monthlyRateSuffix")}
        </span>
      </div>

      <div className={styles.note}>
        <span className={styles.dot} aria-hidden="true" />
        <span>{t("priceNote")}</span>
      </div>

      <div className={styles.actions}>
        <Button
          type="button"
          size="sm"
          className={styles.primaryAction}
          onClick={(event) => {
            stopOpen(event);
            onPrimaryAction(vehicle);
          }}
        >
          {primaryLabel}
        </Button>
        {vehicle.operationalStatus !== "rented" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={t("actions.setPriceTitle")}
            onClick={(event) => {
              stopOpen(event);
              onSetPrice(vehicle);
            }}
          >
            {t("actions.setPrice")}
          </Button>
        ) : null}
        {vehicle.operationalStatus === "rented" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={t("actions.gpsTitle")}
            onClick={(event) => {
              stopOpen(event);
              onGps(vehicle);
            }}
          >
            {t("actions.gps")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(event) => {
            stopOpen(event);
            onMore(vehicle);
          }}
        >
          {t("actions.more")}
        </Button>
      </div>

      {showTimer ? (
        <VehicleRentalTimer endAt={vehicle.currentRental!.endAt} />
      ) : null}
    </Card>
  );
}
