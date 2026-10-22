"use client";

import { useEffect, useRef } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { CompanyIdentity } from "@/shared/components/company-identity";
import type { VehicleDetailDto } from "../../types/vehicle.types";
import { VehicleDetailGallery } from "./vehicle-detail-gallery";
import { getVehicleStatusPresentation } from "../../utils/vehicle-status";
import { getVehicleCardActions } from "../../utils/vehicle-card-actions";
import { getFleetPrimaryPresentation } from "../../utils/fleet-primary-presentation";
import { useRentalReturnDue } from "../../hooks/use-rental-return-due";
import { VehicleStatus } from "../vehicle-status/vehicle-status";
import styles from "./vehicle-detail.module.css";

export interface VehicleDetailProps {
  vehicle: VehicleDetailDto;
  canManage: boolean;
  canReturn: boolean;
  canManageMaintenance: boolean;
  canCancelRental: boolean;
  isPhotoActionPending: boolean;
  isVideoActionPending: boolean;
  isFleetOpsPending: boolean;
  photoActionErrorMessage: string | null;
  videoActionErrorMessage: string | null;
  fleetOpsErrorMessage: string | null;
  onUploadPhoto: (file: File) => void;
  onReplacePhoto: (photoId: string, file: File) => void;
  onDeletePhoto: (photoId: string) => void;
  onUploadVideo: (file: File) => void;
  onDeleteVideo: () => void;
  canShareWhatsApp: boolean;
  onShareWhatsApp: () => void;
  onSetPrice: () => void;
  onPrimaryAction: () => void;
  onSendToMaintenance: () => void;
  onViewMaintenance: () => void;
  onCancelRentalRequest: () => void;
  onReturnNow: () => void;
  onContinueCarIn: () => void;
  renewRentalFooter:
    | { status: "idle" }
    | { status: "loading"; contractId: string }
    | { status: "ready"; contractId: string }
    | { status: "blocked"; contractId: string; backendCanRenew: boolean };
  onRenewRental: () => void;
}

function formatRate(
  value: number | null | undefined,
  format: ReturnType<typeof useFormatter>,
  notSet: string,
): string {
  if (value == null) return notSet;
  return format.number(value);
}

export function VehicleDetail({
  vehicle,
  canManage,
  canReturn,
  canManageMaintenance,
  canCancelRental,
  isPhotoActionPending,
  isVideoActionPending,
  isFleetOpsPending,
  photoActionErrorMessage,
  videoActionErrorMessage,
  fleetOpsErrorMessage,
  onUploadPhoto,
  onReplacePhoto,
  onDeletePhoto,
  onUploadVideo,
  onDeleteVideo,
  canShareWhatsApp,
  onShareWhatsApp,
  onSetPrice,
  onPrimaryAction,
  onSendToMaintenance,
  onViewMaintenance,
  onCancelRentalRequest,
  onReturnNow,
  onContinueCarIn,
  renewRentalFooter,
  onRenewRental,
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
    (rental.status === "paid" ||
      rental.status === "active" ||
      rental.status === "retout");
  const returnDue = useRentalReturnDue(
    rental?.status === "active" ? rental.endAt : null,
  );
  const notSet = t("rateNotSet");
  const mainScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [vehicle.id]);

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

  const showRatesSection = vehicle.operationalStatus === "available";

  const showRenewRentalButton =
    renewRentalFooter.status === "loading" ||
    renewRentalFooter.status === "ready" ||
    renewRentalFooter.status === "blocked";
  const renewRentalDisabled =
    renewRentalFooter.status === "loading" ||
    renewRentalFooter.status === "blocked";
  const renewRentalTitle =
    renewRentalFooter.status === "blocked"
      ? renewRentalFooter.backendCanRenew
        ? t("actions.renewRentalBlockedPermission")
        : t("actions.renewRentalBlockedLifecycle")
      : t("actions.renewRentalTitle");

  const primaryFleetAction =
    actions.showSetRentalPrice && primary.labelKey === "available"
      ? { label: t("fleetPrimary.available"), onClick: onPrimaryAction, variant: "primary" as const }
      : actions.showCarOut
        ? { label: t("fleetPrimary.deliverVehicle"), onClick: onPrimaryAction, variant: "primary" as const }
        : primary.labelKey === "rented"
          ? { label: t("fleetPrimary.rented"), onClick: onPrimaryAction, variant: "primary" as const }
          : primary.labelKey === "urgentFollowUp"
            ? { label: t("fleetPrimary.urgentFollowUp"), onClick: onPrimaryAction, variant: "primary" as const }
            : null;

  return (
    <div className={styles.root} data-testid="vehicle-detail">
      <div
        ref={mainScrollRef}
        className={styles.mainScroll}
        data-testid="vehicle-detail-main-scroll"
      >
        <VehicleDetailGallery
          vehicleId={vehicle.id}
          vehicleName={vehicle.displayName}
          gallery={vehicle.gallery}
          video={vehicle.video}
          canManage={canManage}
          canShareWhatsApp={canShareWhatsApp}
          isPhotoActionPending={isPhotoActionPending}
          isVideoActionPending={isVideoActionPending}
          onUploadPhoto={onUploadPhoto}
          onReplacePhoto={onReplacePhoto}
          onDeletePhoto={onDeletePhoto}
          onUploadVideo={onUploadVideo}
          onDeleteVideo={onDeleteVideo}
          onShareWhatsApp={onShareWhatsApp}
        />

        <header className={styles.identityHeader}>
        <div className={styles.identityMain}>
          <div className={styles.identityTitleRow}>
            <h2 className={styles.identityTitle}>{vehicle.displayName}</h2>
            <div className={styles.statusSlot}>
              <VehicleStatus
                status={vehicle.operationalStatus}
                currentRentalStatus={vehicle.currentRental?.status ?? null}
              />
            </div>
          </div>
          <p className={styles.identityMeta} data-testid="vehicle-detail-plate-line">
            {vehicle.plateNumber ? (
              <>
                <span>{t("detail.plate")}: </span>
                <strong dir="ltr">{vehicle.plateNumber}</strong>
              </>
            ) : null}
            {vehicle.plateNumber && vehicle.modelYear != null ? " · " : null}
            {vehicle.modelYear != null ? (
              <>
                <span>{t("detail.year")}: </span>
                <strong>{format.number(vehicle.modelYear)}</strong>
              </>
            ) : null}
          </p>
          <CompanyIdentity company={vehicle.company} compact className={styles.identityCompany} />
        </div>
      </header>

      <div className={styles.scrollBody}>
        {photoActionErrorMessage ? (
          <p className={styles.photoError} role="alert">{photoActionErrorMessage}</p>
        ) : null}
        {videoActionErrorMessage ? (
          <p className={styles.photoError} role="alert">{videoActionErrorMessage}</p>
        ) : null}
        {fleetOpsErrorMessage ? (
          <p className={styles.photoError} role="alert">{fleetOpsErrorMessage}</p>
        ) : null}

        {!vehicle.isActive ? (
          <p className={styles.inactiveNotice} role="status">{t("inactiveFleetNotice")}</p>
        ) : null}

        <p className={styles.section}>{t("detail.specs")}</p>
        <div className={styles.specs}>
          <div className={styles.spec}>
            <span>{t("detail.color")}</span>
            <b>{vehicle.color ?? "—"}</b>
          </div>
          <div className={styles.spec}>
            <span>{t("detail.company")}</span>
            <b>{vehicle.company.displayName}</b>
          </div>
          <div className={styles.spec}>
            <span>{t("detail.status")}</span>
            <b>{t(statusPresentation.translationKey)}</b>
          </div>
          {vehicle.vin ? (
            <div className={styles.spec}>
              <span>{t("form.vinLabel")}</span>
              <b dir="ltr">{vehicle.vin}</b>
            </div>
          ) : null}
        </div>

        {showRatesSection ? (
          <>
            <p className={`${styles.section} ${styles.sectionSpaced}`}>{t("detail.defaultRates")}</p>
            <div className={styles.rates}>
              <div className={styles.rate}>
                <span>{t("detail.hourly")}</span>
                <b>{formatRate(vehicle.hourlyRate, format, notSet)}</b>
              </div>
              <div className={styles.rate}>
                <span>{t("detail.daily")}</span>
                <b>{formatRate(vehicle.dailyRate, format, notSet)}</b>
              </div>
              <div className={styles.rate}>
                <span>{t("detail.weekly")}</span>
                <b>{formatRate(vehicle.weeklyRate, format, notSet)}</b>
              </div>
              <div className={styles.rate}>
                <span>{t("detail.monthly")}</span>
                <b>{formatRate(vehicle.monthlyRate, format, notSet)}</b>
              </div>
            </div>
          </>
        ) : null}

        {hasRental ? (
          <>
            <p className={`${styles.section} ${styles.sectionSpaced}`}>{t("detail.currentRental")}</p>
            <div className={styles.rentalPanel}>
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
                  <b>
                    {format.dateTime(new Date(rental!.endAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </b>
                </div>
              ) : null}
              {rental!.status === "paid" ? (
                <div className={styles.kv}>
                  <span>{t("detail.status")}</span>
                  <b>{t("fleetPrimary.deliverVehicle")}</b>
                </div>
              ) : null}
              {returnDue && rental!.status === "active" ? (
                <p className={styles.returnDue} role="status">{t("detail.returnDue")}</p>
              ) : null}
            </div>
          </>
        ) : null}

        {vehicle.operationalStatus === "service" ? (
          <>
            <p className={`${styles.section} ${styles.sectionSpaced}`}>{t("detail.operationStatus")}</p>
            <div className={styles.rentalPanel}>
              <div className={styles.kv}>
                <span>{t("detail.status")}</span>
                <b className={styles.serviceStatus}>{t("detail.serviceStatus")}</b>
              </div>
            </div>
          </>
        ) : null}
      </div>
      </div>

      <footer className={styles.actionFooter} data-testid="vehicle-detail-action-footer">
        {primaryFleetAction && !primary.disabled ? (
          <Button
            type="button"
            size="sm"
            variant={primaryFleetAction.variant}
            className={styles.actionPrimary}
            disabled={isFleetOpsPending}
            onClick={primaryFleetAction.onClick}
          >
            {primaryFleetAction.label}
          </Button>
        ) : null}
        {actions.showSetRentalPrice && primary.labelKey === "available" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isFleetOpsPending || primary.disabled}
            onClick={onSetPrice}
          >
            {t("actions.setPriceDetail")}
          </Button>
        ) : null}
        {showRenewRentalButton ? (
          <Button
            type="button"
            size="sm"
            variant="primary"
            className={`${styles.actionPrimary} ${styles.renewRental}`}
            disabled={isFleetOpsPending || renewRentalDisabled}
            title={renewRentalTitle}
            aria-label={t("actions.renewRental")}
            onClick={onRenewRental}
            data-testid="vehicle-detail-renew-rental"
          >
            <Icon name="mdi:calendar-sync" size={18} aria-hidden />
            {t("actions.renewRental")}
          </Button>
        ) : null}
        {showReturnNow ? (
          <Button
            type="button"
            size="sm"
            variant="secondaryStrong"
            className={styles.actionPrimary}
            disabled={isFleetOpsPending}
            onClick={onReturnNow}
          >
            {t("detail.returnNow")}
          </Button>
        ) : null}
        {showContinueCarIn ? (
          <Button
            type="button"
            size="sm"
            variant="secondaryStrong"
            className={styles.actionPrimary}
            onClick={onContinueCarIn}
          >
            {t("detail.continueCarIn")}
          </Button>
        ) : null}
        {showMaintenanceEnter ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isFleetOpsPending || !vehicle.isActive}
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
            className={styles.actionDanger}
            disabled={isFleetOpsPending}
            onClick={onCancelRentalRequest}
          >
            {t("detail.cancelRentalRequest")}
          </Button>
        ) : null}
      </footer>
    </div>
  );
}
