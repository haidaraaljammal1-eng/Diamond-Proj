"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Icon } from "@/shared/components/ui/icon";
import { CompanyIdentity } from "@/shared/components/company-identity";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { shouldShowCurrentRental } from "../../utils/rental-timer";
import {
  getVehicleCardActions,
  type VehicleFleetPermissions,
} from "../../utils/vehicle-card-actions";
import { getFleetPrimaryPresentation } from "../../utils/fleet-primary-presentation";
import {
  resolveVehicleColorCss,
  vehicleColorSwatchNeedsBorder,
} from "../../utils/vehicle-color-swatch";
import { VehicleRentalTimer } from "../vehicle-rental-timer/vehicle-rental-timer";
import styles from "./vehicle-card.module.css";

export interface VehicleCardProps {
  vehicle: VehicleCardDto;
  fleetPermissions: VehicleFleetPermissions;
  onOpen: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onEditRates: (vehicle: VehicleCardDto) => void;
  onDelete: (vehicle: VehicleCardDto) => void;
  onGps: (vehicle: VehicleCardDto) => void;
}

function stopOpen(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function hasFleetManagementUi(permissions: VehicleFleetPermissions): boolean {
  return permissions.canAddDelete || permissions.canEditPrices;
}

export function VehicleCard({
  vehicle,
  fleetPermissions,
  onOpen,
  onPrimaryAction,
  onEditRates,
  onDelete,
  onGps,
}: VehicleCardProps) {
  const t = useTranslations("Vehicles");
  const format = useFormatter();
  const actions = getVehicleCardActions(vehicle, fleetPermissions);
  const primary = getFleetPrimaryPresentation(vehicle);
  const canManageFleet = hasFleetManagementUi(fleetPermissions);
  const showRenter = shouldShowCurrentRental(
    vehicle.operationalStatus,
    vehicle.currentRental,
  );
  const showTimer =
    vehicle.operationalStatus === "rented" &&
    (vehicle.currentRental?.status === "active" ||
      vehicle.currentRental?.status === "retout");

  const missingLabel = t("rateNotSet");
  const colorCss = resolveVehicleColorCss(vehicle.color);
  const swatchBorder = vehicleColorSwatchNeedsBorder(colorCss);

  const primaryLabel = t(`fleetPrimary.${primary.labelKey}`);
  const primaryClass = [
    styles.primaryControl,
    primary.labelKey === "available" ? styles.primaryAvailable : "",
    primary.labelKey === "deliverVehicle" ? styles.primaryDeliver : "",
    primary.labelKey === "rented" ? styles.primaryRented : "",
    primary.labelKey === "urgentFollowUp" ? styles.primaryUrgent : "",
    primary.labelKey === "maintenance" ? styles.primaryMaintenance : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showSecondary =
    actions.showEditRates || actions.showDelete || actions.showGps;

  return (
    <Card
      interactive
      padding="none"
      className={styles.card}
      data-testid="vehicle-card"
      data-record-id={String(vehicle.id)}
      data-record-external-id={vehicle.externalId ?? undefined}
      data-fleet-attention={vehicle.fleetAttentionTier ?? undefined}
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
      <div className={styles.companyCorner}>
        <CompanyIdentity company={vehicle.company} compact />
      </div>

      <div className={styles.identityBlock}>
        <h4 className={styles.vehicleName}>{vehicle.displayName}</h4>
        <div className={styles.plateWrap}>
          {vehicle.plateNumber ? (
            <span className={styles.plate} dir="ltr">
              {vehicle.plateNumber}
            </span>
          ) : (
            <span className={`${styles.plate} ${styles.plateMissing}`}>{missingLabel}</span>
          )}
        </div>
        {vehicle.color ? (
          <div className={styles.colorRow}>
            <span
              className={`${styles.swatch} ${swatchBorder ? styles.swatchBorder : ""}`}
              style={colorCss ? { background: colorCss } : undefined}
              aria-hidden="true"
            />
            <span className={styles.colorLabel}>{vehicle.color}</span>
          </div>
        ) : null}
      </div>

      {showRenter ? (
        <p className={styles.renter}>
          {t("currentRenter", { name: vehicle.currentRental!.customerName })}
        </p>
      ) : null}

      <div className={styles.rate}>
        <div className={styles.ratePrimary}>
          {vehicle.dailyRate != null ? (
            <>
              <b className={styles.rateValue}>{format.number(vehicle.dailyRate)}</b>
              <span className={styles.rateUnit}>{t("dailyRateSuffix")}</span>
            </>
          ) : (
            <span className={styles.rateMissing}>{missingLabel}</span>
          )}
        </div>
        <span className={styles.rateSecondary}>
          {vehicle.monthlyRate != null
            ? `${format.number(vehicle.monthlyRate)} ${t("monthlyRateSuffix")}`
            : `${missingLabel} · ${t("monthlyRateSuffix")}`}
        </span>
      </div>

      {canManageFleet && (primary.labelKey !== "maintenance" || showSecondary) ? (
        <div className={styles.actions}>
          {primary.labelKey !== "maintenance" ? (
            <button
              type="button"
              className={primaryClass}
              disabled={primary.disabled}
              aria-label={primaryLabel}
              onClick={(event) => {
                stopOpen(event);
                onPrimaryAction(vehicle);
              }}
            >
              {primaryLabel}
            </button>
          ) : (
            <span className={primaryClass} aria-disabled="true">
              {primaryLabel}
            </span>
          )}
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
      ) : primary.labelKey === "maintenance" ? (
        <div className={styles.actions}>
          <span className={primaryClass} aria-disabled="true">
            {primaryLabel}
          </span>
        </div>
      ) : null}

      {showTimer && vehicle.currentRental ? (
        <VehicleRentalTimer endAt={vehicle.currentRental.endAt} />
      ) : null}
    </Card>
  );
}
