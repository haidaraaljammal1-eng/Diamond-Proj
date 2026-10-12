"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { VehiclePhotoButton } from "../../forms/add-vehicle/vehicle-photo-button";
import type { VehicleDetailDto } from "../../types/vehicle.types";
import { getVehicleStatusPresentation } from "../../utils/vehicle-status";
import { getVehicleCardActions } from "../../utils/vehicle-card-actions";
import { getFleetPrimaryPresentation } from "../../utils/fleet-primary-presentation";
import { useRentalReturnDue } from "../../hooks/use-rental-return-due";
import { VehicleImage } from "../vehicle-image/vehicle-image";
import { VehicleStatus } from "../vehicle-status/vehicle-status";
import styles from "./vehicle-detail.module.css";

export interface VehicleDetailProps {
  vehicle: VehicleDetailDto;
  canManage: boolean;
  canReturn: boolean;
  canManageMaintenance: boolean;
  canCancelRental: boolean;
  isPhotoActionPending: boolean;
  isFleetOpsPending: boolean;
  photoActionErrorMessage: string | null;
  fleetOpsErrorMessage: string | null;
  onUploadPhoto: (file: File) => void;
  onReplacePhoto: (file: File) => void;
  onSetPrice: () => void;
  onPrimaryAction: () => void;
  onSendToMaintenance: () => void;
  onViewMaintenance: () => void;
  onCancelRentalRequest: () => void;
  onReturnNow: () => void;
  onContinueCarIn: () => void;
}

export function VehicleDetail({
  vehicle,
  canManage,
  canReturn,
  canManageMaintenance,
  canCancelRental,
  isPhotoActionPending,
  isFleetOpsPending,
  photoActionErrorMessage,
  fleetOpsErrorMessage,
  onUploadPhoto,
  onReplacePhoto,
  onSetPrice,
  onPrimaryAction,
  onSendToMaintenance,
  onViewMaintenance,
  onCancelRentalRequest,
  onReturnNow,
  onContinueCarIn,
}: VehicleDetailProps) {
  const t = useTranslations("Vehicles");
  const format = useFormatter();
  const statusPresentation = getVehicleStatusPresentation(
    vehicle.operationalStatus,
    vehicle.currentRental?.status,
  );
  const rental = vehicle.currentRental;
  const actions = getVehicleCardActions(vehicle, canManage);
  const primary = getFleetPrimaryPresentation(vehicle);
  const hasRental =
    rental != null &&
    (vehicle.operationalStatus === "rented" || rental.status === "paid");
  const primaryImage = vehicle.primaryImage;
  const returnDue = useRentalReturnDue(
    rental?.status === "active" ? rental.endAt : null,
  );

  const showReturnNow =
    canReturn &&
    vehicle.operationalStatus === "rented" &&
    rental?.status === "active";

  const showContinueCarIn =
    canReturn &&
    vehicle.operationalStatus === "rented" &&
    rental?.status === "retout";

  const showMaintenanceEnter =
    canManageMaintenance && vehicle.operationalStatus === "available";

  const showViewMaintenance =
    canManageMaintenance && vehicle.operationalStatus === "service";

  return (
    <div className={styles.root} data-testid="vehicle-detail">
      <div className={styles.hero}>
        <div className={styles.heroImageWrap}>
          <VehicleImage
            path={primaryImage?.url}
            alt={vehicle.displayName}
            className={styles.heroImage}
          />
        </div>
        <VehicleStatus
          status={vehicle.operationalStatus}
          currentRentalStatus={vehicle.currentRental?.status ?? null}
          className={styles.heroStatus}
        />
        <div className={styles.heroFooter}>
          <div className={styles.heroTitle}>
            <div className={styles.heroIdentity}>
              <h3>{vehicle.displayName}</h3>
              <CompanyIdentity company={vehicle.company} compact className={styles.heroCompany} />
            </div>
            <p>
              {vehicle.plateNumber ? (
                <span dir="ltr">{vehicle.plateNumber}</span>
              ) : null}
              {vehicle.plateNumber && vehicle.modelYear != null ? " · " : null}
              {vehicle.modelYear != null ? format.number(vehicle.modelYear) : null}
            </p>
          </div>
          {canManage && primaryImage ? (
            <div className={styles.heroPhotoAction}>
              <VehiclePhotoButton
                label={t("detail.replacePhoto")}
                ariaLabel={t("detail.replacePhoto")}
                variant="secondaryStrong"
                size="sm"
                disabled={isPhotoActionPending}
                loading={isPhotoActionPending}
                iconName="mdi:image-edit-outline"
                onFileSelected={onReplacePhoto}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.body}>
        {photoActionErrorMessage ? (
          <p className={styles.photoError} role="alert">{photoActionErrorMessage}</p>
        ) : null}
        {fleetOpsErrorMessage ? (
          <p className={styles.photoError} role="alert">{fleetOpsErrorMessage}</p>
        ) : null}

        {!primaryImage ? (
          <div className={styles.photoEmpty}>
            <span>{t("detail.noPhoto")}</span>
            {canManage ? (
              <VehiclePhotoButton
                label={t("form.uploadPhoto")}
                ariaLabel={t("form.uploadPhoto")}
                variant="secondaryStrong"
                size="sm"
                disabled={isPhotoActionPending}
                loading={isPhotoActionPending}
                iconName="mdi:image-plus"
                onFileSelected={onUploadPhoto}
              />
            ) : null}
          </div>
        ) : null}

        <p className={styles.section}>{t("detail.specs")}</p>
        <div className={styles.specs}>
          <div className={styles.spec}>
            <span>{t("detail.year")}</span>
            <b>{vehicle.modelYear != null ? format.number(vehicle.modelYear) : "—"}</b>
          </div>
          <div className={styles.spec}>
            <span>{t("detail.color")}</span>
            <b>{vehicle.color ?? "—"}</b>
          </div>
          <div className={styles.spec}>
            <span>{t("detail.plate")}</span>
            <b dir="ltr">{vehicle.plateNumber ?? "—"}</b>
          </div>
          <div className={styles.spec}>
            <span>{t("detail.status")}</span>
            <b>{t(statusPresentation.translationKey)}</b>
          </div>
        </div>

        {vehicle.operationalStatus === "available" ? (
          <>
            <p className={styles.section}>{t("detail.defaultRates")}</p>
            <div className={styles.rates}>
              <div className={styles.rate}>
                <span>{t("detail.hourly")}</span>
                <b>{vehicle.hourlyRate != null ? format.number(vehicle.hourlyRate) : t("rateNotSet")}</b>
              </div>
              <div className={styles.rate}>
                <span>{t("detail.daily")}</span>
                <b>{vehicle.dailyRate != null ? format.number(vehicle.dailyRate) : t("rateNotSet")}</b>
              </div>
              <div className={styles.rate}>
                <span>{t("detail.weekly")}</span>
                <b>{vehicle.weeklyRate != null ? format.number(vehicle.weeklyRate) : t("rateNotSet")}</b>
              </div>
              <div className={styles.rate}>
                <span>{t("detail.monthly")}</span>
                <b>{vehicle.monthlyRate != null ? format.number(vehicle.monthlyRate) : t("rateNotSet")}</b>
              </div>
            </div>
          </>
        ) : null}

        {hasRental ? (
          <>
            <p className={styles.section}>{t("detail.currentRental")}</p>
            <div className={styles.kv}>
              <span>{t("detail.renter")}</span>
              <b>{rental!.customerName}</b>
            </div>
            <div className={styles.kv}>
              <span>{t("detail.contractId")}</span>
              <b className={styles.contractId} dir="ltr">
                {rental!.contractNumber ?? rental!.contractId}
              </b>
            </div>
            {rental!.status === "active" ? (
              <div className={styles.kv}>
                <span>{t("detail.scheduledReturn")}</span>
                <b>{format.dateTime(new Date(rental!.endAt), { dateStyle: "medium", timeStyle: "short" })}</b>
              </div>
            ) : null}
            {returnDue && rental!.status === "active" ? (
              <p className={styles.returnDue} role="status">{t("detail.returnDue")}</p>
            ) : null}
          </>
        ) : null}

        {vehicle.operationalStatus === "service" ? (
          <>
            <p className={styles.section}>{t("detail.operationStatus")}</p>
            <div className={styles.kv}>
              <span>{t("detail.status")}</span>
              <b className={styles.serviceStatus}>{t("detail.serviceStatus")}</b>
            </div>
          </>
        ) : null}

        <div className={styles.actions}>
          {actions.showSetRentalPrice && primary.labelKey === "available" ? (
            <>
              <Button type="button" size="sm" onClick={onPrimaryAction}>
                {t("fleetPrimary.available")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onSetPrice}>
                {t("actions.setPriceDetail")}
              </Button>
            </>
          ) : null}
          {actions.showCarOut ? (
            <Button type="button" size="sm" onClick={onPrimaryAction}>
              {t("fleetPrimary.deliverVehicle")}
            </Button>
          ) : null}
          {primary.labelKey === "rented" ? (
            <Button type="button" size="sm" onClick={onPrimaryAction}>
              {t("fleetPrimary.rented")}
            </Button>
          ) : null}
          {showReturnNow ? (
            <Button
              type="button"
              size="sm"
              variant="secondaryStrong"
              disabled={isFleetOpsPending}
              onClick={onReturnNow}
            >
              {t("detail.returnNow")}
            </Button>
          ) : null}
          {showContinueCarIn ? (
            <Button type="button" size="sm" variant="secondaryStrong" onClick={onContinueCarIn}>
              {t("detail.continueCarIn")}
            </Button>
          ) : null}
          {showMaintenanceEnter ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isFleetOpsPending}
              onClick={onSendToMaintenance}
            >
              {t("detail.sendToMaintenance")}
            </Button>
          ) : null}
          {showViewMaintenance ? (
            <Button type="button" size="sm" variant="secondary" onClick={onViewMaintenance}>
              {t("detail.viewMaintenance")}
            </Button>
          ) : null}
          {canCancelRental ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isFleetOpsPending}
              onClick={onCancelRentalRequest}
            >
              {t("detail.cancelRentalRequest")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
