"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import type { VehicleDetailDto } from "../../types/vehicle.types";
import {
  deriveHourlyRate,
  deriveMonthlyRate,
} from "../../utils/vehicle-pricing";
import { getVehicleStatusPresentation } from "../../utils/vehicle-status";
import { VehicleImage } from "../vehicle-image/vehicle-image";
import { VehicleStatus } from "../vehicle-status/vehicle-status";
import styles from "./vehicle-detail.module.css";

export interface VehicleDetailProps {
  vehicle: VehicleDetailDto;
  onSetPrice: () => void;
  onPrimaryAction: () => void;
  onGps: () => void;
  onMaintenance: () => void;
}

export function VehicleDetail({
  vehicle,
  onSetPrice,
  onPrimaryAction,
  onGps,
  onMaintenance,
}: VehicleDetailProps) {
  const t = useTranslations("Vehicles");
  const format = useFormatter();
  const statusPresentation = getVehicleStatusPresentation(vehicle.operationalStatus);
  const rental = vehicle.currentRental;
  const hasRental = rental != null && vehicle.operationalStatus === "rented";

  return (
    <div className={styles.root} data-testid="vehicle-detail">
      <div className={styles.hero}>
        <VehicleImage
          path={vehicle.primaryImage?.url}
          alt={vehicle.displayName}
          className={styles.heroImage}
        />
        <VehicleStatus status={vehicle.operationalStatus} className={styles.heroStatus} />
        <div className={styles.heroTitle}>
          <h3>{vehicle.displayName}</h3>
          <p>
            {vehicle.plateNumber ? (
              <span dir="ltr">{vehicle.plateNumber}</span>
            ) : null}
            {vehicle.plateNumber && vehicle.modelYear != null ? " · " : null}
            {vehicle.modelYear != null ? format.number(vehicle.modelYear) : null}
          </p>
        </div>
      </div>

      <div className={styles.body}>
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

        {vehicle.gallery.length > 0 ? (
          <div className={styles.gallery}>
            {vehicle.gallery.map((image) => (
              <button
                key={image.id}
                type="button"
                className={styles.galleryItem}
                aria-label={t("detail.galleryItem", { name: vehicle.displayName })}
              >
                <VehicleImage path={image.url} alt={vehicle.displayName} className={styles.galleryImage} />
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.galleryEmpty}>{t("detail.galleryEmpty")}</div>
        )}

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
          {vehicle.operationalStatus === "available" ? (
            <>
              <Button type="button" size="sm" onClick={onPrimaryAction}>
                {t("actions.generateLinkSetPrice")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onSetPrice}>
                {t("actions.setPriceDetail")}
              </Button>
            </>
          ) : null}
          {vehicle.operationalStatus === "rented" ? (
            <>
              <Button type="button" size="sm" onClick={onPrimaryAction}>
                {t("actions.generateReturnLink")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onGps}>
                {t("actions.gpsTrack")}
              </Button>
            </>
          ) : null}
          {vehicle.operationalStatus === "service" ? (
            <Button type="button" size="sm" onClick={onMaintenance}>
              {t("actions.goMaintenance")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
