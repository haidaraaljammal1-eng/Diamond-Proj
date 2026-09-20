"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { VehiclePhotoButton } from "../../forms/add-vehicle/vehicle-photo-button";
import type { VehicleDetailDto } from "../../types/vehicle.types";
import {
  deriveHourlyRate,
  deriveMonthlyRate,
} from "../../utils/vehicle-pricing";
import { getVehicleStatusPresentation } from "../../utils/vehicle-status";
import { getVehicleCardActions } from "../../utils/vehicle-card-actions";
import { VehicleImage } from "../vehicle-image/vehicle-image";
import { VehicleStatus } from "../vehicle-status/vehicle-status";
import styles from "./vehicle-detail.module.css";

export interface VehicleDetailProps {
  vehicle: VehicleDetailDto;
  canManage: boolean;
  isPhotoActionPending: boolean;
  photoActionErrorMessage: string | null;
  onUploadPhoto: (file: File) => void;
  onReplacePhoto: (file: File) => void;
  onSetPrice: () => void;
  onPrimaryAction: () => void;
  onGps: () => void;
  onMaintenance: () => void;
}

export function VehicleDetail({
  vehicle,
  canManage,
  isPhotoActionPending,
  photoActionErrorMessage,
  onUploadPhoto,
  onReplacePhoto,
  onSetPrice,
  onPrimaryAction,
  onGps,
  onMaintenance,
}: VehicleDetailProps) {
  const t = useTranslations("Vehicles");
  const format = useFormatter();
  const statusPresentation = getVehicleStatusPresentation(
    vehicle.operationalStatus,
    vehicle.currentRental?.status,
  );
  const rental = vehicle.currentRental;
  const actions = getVehicleCardActions(vehicle, canManage);
  const hasRental =
    rental != null &&
    (vehicle.operationalStatus === "rented" || rental.status === "paid");
  const primaryImage = vehicle.primaryImage;

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
                <b>{format.number(deriveHourlyRate(vehicle.dailyRate))}</b>
              </div>
              <div className={styles.rate}>
                <span>{t("detail.daily")}</span>
                <b>{format.number(vehicle.dailyRate ?? 0)}</b>
              </div>
              <div className={styles.rate}>
                <span>{t("detail.monthly")}</span>
                <b>{format.number(deriveMonthlyRate(vehicle.dailyRate, vehicle.monthlyRate))}</b>
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
              <b className={styles.contractId} dir="ltr">{rental!.contractId}</b>
            </div>
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
          {actions.showSetRentalPrice ? (
            <>
              <Button type="button" size="sm" onClick={onPrimaryAction}>
                {t("actions.generateLinkSetPrice")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onSetPrice}>
                {t("actions.setPriceDetail")}
              </Button>
            </>
          ) : null}
          {actions.showCarOut ? (
            <Button type="button" size="sm" onClick={onPrimaryAction}>
              {t("actions.carOut")}
            </Button>
          ) : null}
          {actions.showReturnLink ? (
            <>
              <Button type="button" size="sm" onClick={onPrimaryAction}>
                {t("actions.generateReturnLink")}
              </Button>
              {actions.showGps ? (
                <Button type="button" size="sm" variant="ghost" onClick={onGps}>
                  {t("actions.gpsTrack")}
                </Button>
              ) : null}
            </>
          ) : null}
          {actions.showMaintenance ? (
            <Button type="button" size="sm" onClick={onMaintenance}>
              {t("actions.goMaintenance")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
