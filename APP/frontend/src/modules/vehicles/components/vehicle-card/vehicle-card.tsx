"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Icon } from "@/shared/components/ui/icon";
import type { VehicleCardDto } from "../../types/vehicle.types";
import {
  shouldShowCurrentRental,
  shouldShowRentalTimer,
} from "../../utils/rental-timer";
import { getVehicleCardActions } from "../../utils/vehicle-card-actions";
import { VehicleImage } from "../vehicle-image/vehicle-image";
import { VehicleRentalTimer } from "../vehicle-rental-timer/vehicle-rental-timer";
import { VehicleStatus } from "../vehicle-status/vehicle-status";
import styles from "./vehicle-card.module.css";

export interface VehicleCardProps {
  vehicle: VehicleCardDto;
  canManage: boolean;
  onOpen: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onEditRates: (vehicle: VehicleCardDto) => void;
  onDelete: (vehicle: VehicleCardDto) => void;
  onGps: (vehicle: VehicleCardDto) => void;
}

function stopOpen(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

export function VehicleCard({
  vehicle,
  canManage,
  onOpen,
  onPrimaryAction,
  onEditRates,
  onDelete,
  onGps,
}: VehicleCardProps) {
  const t = useTranslations("Vehicles");
  const format = useFormatter();
  const actions = getVehicleCardActions(vehicle, canManage);
  const showRenter = shouldShowCurrentRental(
    vehicle.operationalStatus,
    vehicle.currentRental,
  );
  const showTimer = shouldShowRentalTimer(
    vehicle.operationalStatus,
    vehicle.currentRental,
  );

  const primaryLabel = actions.showMaintenance
    ? t("actions.goMaintenanceShort")
    : actions.showReturnLink
      ? t("actions.generateReturnLinkShort")
      : actions.showCarOut
        ? t("actions.carOutShort")
        : t("actions.generateLinkSetPriceShort");

  const primaryTitle = actions.showMaintenance
    ? t("actions.goMaintenance")
    : actions.showReturnLink
      ? t("actions.generateReturnLink")
      : actions.showCarOut
        ? t("actions.carOut")
        : t("actions.generateLinkSetPrice");

  const showPrimary =
    actions.showSetRentalPrice ||
    actions.showReturnLink ||
    actions.showMaintenance ||
    actions.showCarOut;

  return (
    <Card
      interactive
      padding="none"
      className={styles.card}
      data-testid="vehicle-card"
      data-record-id={String(vehicle.id)}
      data-record-external-id={vehicle.externalId ?? undefined}
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
        <VehicleStatus
          status={vehicle.operationalStatus}
          currentRentalStatus={vehicle.currentRental?.status ?? null}
          solid
          className={styles.status}
        />
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
        <b className={styles.rateValue}>{format.number(vehicle.dailyRate ?? 0)}</b>
        <span className={styles.rateUnit}>{t("dailyRateSuffix")}</span>
        <span className={styles.monthly}>
          {format.number(vehicle.monthlyRate ?? 0)} {t("monthlyRateSuffix")}
        </span>
      </div>

      <div className={styles.note}>
        <span className={styles.dot} aria-hidden="true" />
        <span>{t("priceNote")}</span>
      </div>

      {showPrimary || actions.showEditRates || actions.showDelete || actions.showGps ? (
        <div className={styles.actions}>
          {showPrimary ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className={styles.primaryAction}
              title={primaryTitle}
              aria-label={primaryTitle}
              onClick={(event) => {
                stopOpen(event);
                onPrimaryAction(vehicle);
              }}
            >
              <Icon
                name={
                  actions.showMaintenance
                    ? "mdi:wrench-outline"
                    : actions.showReturnLink
                      ? "mdi:keyboard-return"
                      : actions.showCarOut
                        ? "mdi:car-arrow-right"
                        : "mdi:link-variant"
                }
              />
              {primaryLabel}
            </Button>
          ) : null}
          {actions.showEditRates ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={styles.iconAction}
              title={t("actions.editRatesTitle")}
              aria-label={t("actions.editRates")}
              onClick={(event) => {
                stopOpen(event);
                onEditRates(vehicle);
              }}
            >
              <Icon name="mdi:pencil-outline" size={17} />
            </Button>
          ) : null}
          {actions.showDelete ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={styles.iconAction}
              title={t("actions.deleteTitle")}
              aria-label={t("actions.delete")}
              onClick={(event) => {
                stopOpen(event);
                onDelete(vehicle);
              }}
            >
              <Icon name="mdi:trash-can-outline" size={17} />
            </Button>
          ) : null}
          {actions.showGps ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={styles.iconAction}
              title={t("actions.gpsTitle")}
              aria-label={t("actions.gpsTrack")}
              onClick={(event) => {
                stopOpen(event);
                onGps(vehicle);
              }}
            >
              <Icon name="mdi:map-marker-outline" size={17} />
            </Button>
          ) : null}
        </div>
      ) : null}

      {showTimer ? (
        <VehicleRentalTimer endAt={vehicle.currentRental!.endAt} />
      ) : null}
    </Card>
  );
}
