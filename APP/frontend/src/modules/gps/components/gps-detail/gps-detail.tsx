"use client";

import type { ReactNode } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Drawer } from "@/shared/components/ui/drawer";
import { Icon } from "@/shared/components/ui/icon";
import { CompanyIdentity } from "@/shared/components/company-identity";
import type { GpsVehicleDetailDto } from "../../types/gps.types";
import {
  displayMotionStatusFromGpsLocation,
  hasMapCoordinates,
  toValidGpsDate,
} from "../../utils/gps-status";
import {
  formatGpsDetailCoordinate,
  formatGpsDetailHeading,
  formatGpsDetailSpeedValue,
  GPS_DETAIL_PLACEHOLDER,
  gpsDetailDisplayedSpeedKph,
  gpsDetailEnginePresentationFromMotion,
  gpsDetailProviderLabel,
  headingCardinalKey,
} from "../../utils/gps-detail-present";
import styles from "./gps-detail.module.css";

export interface GpsDetailDrawerProps {
  open: boolean;
  detail: GpsVehicleDetailDto | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}

function FieldLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <p className={styles.fieldLabel}>
      <Icon name={icon} size={16} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function MotionBadge({
  status,
  label,
}: {
  status: "moving" | "idle" | "parked";
  label: string;
}) {
  return (
    <span
      className={[styles.motionBadge, styles[`motionBadge_${status}`]].join(" ")}
      data-testid="gps-detail-motion-badge"
      data-motion={status}
    >
      {label}
    </span>
  );
}

export function GpsDetailDrawer({
  open,
  detail,
  loading,
  error,
  onClose,
  onRetry,
}: GpsDetailDrawerProps) {
  const t = useTranslations("Gps");
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const vehicle = detail?.vehicle;
  const gps = detail?.gps;
  const plate = vehicle?.plateNumber?.trim() || t("gpsVehicle");
  const displayMotion = gps
    ? displayMotionStatusFromGpsLocation(gps, now)
    : "parked";
  const speedValue = formatGpsDetailSpeedValue(
    gpsDetailDisplayedSpeedKph(displayMotion, gps?.speedKph),
  );
  const headingValue = formatGpsDetailHeading(gps?.headingDegrees);
  const headingCardinal =
    gps?.headingDegrees != null && Number.isFinite(gps.headingDegrees)
      ? t(headingCardinalKey(gps.headingDegrees))
      : null;
  const hasCoords = gps && hasMapCoordinates(gps.latitude, gps.longitude);
  const captured = toValidGpsDate(gps?.capturedAt ?? null);

  const enginePresentation = gpsDetailEnginePresentationFromMotion(displayMotion);
  const ignitionLabel =
    enginePresentation === "on"
      ? t("detail.ignition.on")
      : t("detail.ignition.off");
  const engineValueClass =
    enginePresentation === "on" ? styles.engineOn : styles.engineOff;

  const providerLabel = gpsDetailProviderLabel(detail?.binding, t);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("detail.title")}
      closeLabel={t("detail.close")}
      anchor="left"
      width="compact"
      closePresentation="icon"
      headerTone="minimal"
    >
      {loading ? <p className={styles.muted}>{t("detail.loading")}</p> : null}
      {error ? (
        <div className={styles.error} role="status">
          <p>{error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {detail && vehicle && gps ? (
        <div className={styles.shell} data-testid="gps-detail">
          <header className={styles.hero}>
            <div className={styles.heroTitleRow}>
              <h3 className={styles.vehicleName}>{vehicle.displayName}</h3>
              <MotionBadge
                status={displayMotion}
                label={t(`status.${displayMotion}`)}
              />
            </div>
            <p className={styles.plateRow}>
              <Icon name="mdi:card-text-outline" size={14} aria-hidden />
              <span className={styles.ltrIsolate} dir="ltr">{plate}</span>
            </p>
          </header>

          <section className={styles.identityStrip} aria-label={t("detail.company")}>
            <div className={styles.identityCell}>
              <FieldLabel icon="mdi:office-building-outline">
                {t("detail.company")}
              </FieldLabel>
              <div className={styles.identityValue}>
                <CompanyIdentity
                  company={vehicle.company}
                  compact
                  className={styles.identityCompany}
                />
              </div>
            </div>
            <div className={styles.identityCell}>
              <FieldLabel icon="mdi:satellite-variant">
                {t("detail.provider")}
              </FieldLabel>
              <p className={styles.identityValueText}>{providerLabel}</p>
            </div>
          </section>

          <section className={styles.telemetryStrip} aria-label={t("detail.liveStatus")}>
            <div className={[styles.statBlock, styles.statBlockSpeed].join(" ")}>
              <FieldLabel icon="mdi:speedometer">
                {t("detail.currentSpeed")}
              </FieldLabel>
              <p
                className={[
                  styles.statPrimary,
                  styles.ltrIsolate,
                  speedValue ? styles.speedValue : "",
                ].join(" ")}
                dir="ltr"
              >
                {speedValue ?? GPS_DETAIL_PLACEHOLDER}
                {speedValue ? (
                  <span className={styles.statUnit}>{t("detail.speedUnit")}</span>
                ) : null}
              </p>
            </div>
            <div className={styles.statBlock}>
              <FieldLabel icon="mdi:engine-outline">
                {t("detail.engine")}
              </FieldLabel>
              <p
                className={[styles.statPrimary, styles.engineValue, engineValueClass].join(
                  " ",
                )}
              >
                {ignitionLabel}
              </p>
            </div>
            <div className={styles.statBlock}>
              <FieldLabel icon="mdi:compass-outline">
                {t("detail.heading")}
              </FieldLabel>
              <p className={[styles.statPrimary, styles.ltrIsolate].join(" ")} dir="ltr">
                {headingValue}
              </p>
              {headingCardinal ? (
                <p className={styles.statSecondary}>{headingCardinal}</p>
              ) : null}
            </div>
          </section>

          <section className={styles.locationSection} aria-label={t("detail.currentLocation")}>
            <FieldLabel icon="mdi:map-marker-outline">
              {t("detail.currentLocation")}
            </FieldLabel>
            <p className={styles.address}>{t("detail.addressUnavailable")}</p>
            <dl className={styles.coordPair}>
              <div className={styles.coordCell}>
                <dt>{t("detail.latitude")}</dt>
                <dd className={[styles.mono, styles.ltrIsolate].join(" ")} dir="ltr">
                  {hasCoords
                    ? formatGpsDetailCoordinate(gps.latitude)
                    : GPS_DETAIL_PLACEHOLDER}
                </dd>
              </div>
              <div className={styles.coordCell}>
                <dt>{t("detail.longitude")}</dt>
                <dd className={[styles.mono, styles.ltrIsolate].join(" ")} dir="ltr">
                  {hasCoords
                    ? formatGpsDetailCoordinate(gps.longitude)
                    : GPS_DETAIL_PLACEHOLDER}
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.timeSection} aria-label={t("detail.lastLocationUpdate")}>
            <FieldLabel icon="mdi:clock-outline">
              {t("detail.lastLocationUpdate")}
            </FieldLabel>
            <p className={styles.timePrimary}>
              {captured
                ? format.relativeTime(captured, now)
                : GPS_DETAIL_PLACEHOLDER}
            </p>
            {captured ? (
              <p
                className={[styles.timeSecondary, styles.ltrIsolate].join(" ")}
                dir="ltr"
              >
                {format.dateTime(captured, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
