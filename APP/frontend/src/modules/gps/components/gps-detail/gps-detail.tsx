"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Chip } from "@/shared/components/ui/chip";
import { Drawer } from "@/shared/components/ui/drawer";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
import { VehicleStatus } from "@/modules/vehicles/components/vehicle-status/vehicle-status";
import { useGpsReports } from "../../hooks/use-gps-reports";
import { useGpsHealth } from "../../hooks/use-gps-health";
import type { GpsVehicleDetailDto } from "../../types/gps.types";
import {
  formatGpsCoordinates,
  hasMapCoordinates,
  trackingChipTone,
} from "../../utils/gps-status";
import styles from "./gps-detail.module.css";

export interface GpsDetailDrawerProps {
  open: boolean;
  detail: GpsVehicleDetailDto | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onViewHistory: () => void;
  onViewContract: (contractId: string) => void;
}

function Kv({ label, value, ltr }: { label: string; value?: string | null; ltr?: boolean }) {
  if (!value) return null;
  return (
    <div className={styles.kv}>
      <span>{label}</span>
      <b dir={ltr ? "ltr" : undefined}>{value}</b>
    </div>
  );
}

export function GpsDetailDrawer({
  open,
  detail,
  loading,
  error,
  onClose,
  onRetry,
  onViewHistory,
  onViewContract,
}: GpsDetailDrawerProps) {
  const t = useTranslations("Gps");
  const format = useFormatter();
  const reports = useGpsReports();
  const healthState = useGpsHealth();
  const { load: loadHealth, reset: resetHealth } = healthState;
  const { reset: resetReports } = reports;
  const [overspeedDate, setOverspeedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [thresholdKph, setThresholdKph] = useState("80");
  const vehicle = detail?.vehicle;
  const gps = detail?.gps;
  const rental = detail?.currentRental;
  const coords =
    gps && hasMapCoordinates(gps.latitude, gps.longitude)
      ? formatGpsCoordinates(gps.latitude!, gps.longitude!)
      : null;

  useEffect(() => {
    resetReports();
    resetHealth();
    if (detail?.vehicle.id != null) {
      void loadHealth(detail.vehicle.id);
    }
  }, [detail?.vehicle.id, loadHealth, resetHealth, resetReports]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("detail.title")}
      closeLabel={t("detail.close")}
      heading={vehicle?.plateNumber ?? undefined}
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
        <div className={styles.body} data-testid="gps-detail">
          <div className={styles.hero}>
            <VehicleImage path={vehicle.primaryImageUrl} alt="" className={styles.photo} />
            <div>
              <h3 className={styles.name}>{vehicle.displayName}</h3>
              <p className={styles.plate} dir="ltr">
                {vehicle.plateNumber || t("noPlate")}
              </p>
              <div className={styles.identityRow}>
                <CompanyIdentity company={vehicle.company} compact />
              </div>
              <div className={styles.chips}>
                <Chip tone={trackingChipTone(gps.trackingStatus)} dot>
                  {t(`status.${gps.trackingStatus}`)}
                </Chip>
                <VehicleStatus
                  status={vehicle.operationalStatus}
                  currentRentalStatus={rental?.status ?? null}
                />
              </div>
            </div>
          </div>

          <section>
            <h4 className={styles.section}>{t("detail.vehicle")}</h4>
            <Kv label={t("detail.year")} value={vehicle.modelYear ? String(vehicle.modelYear) : null} />
            <Kv label={t("detail.type")} value={vehicle.vehicleType} />
            <Kv label={t("detail.color")} value={vehicle.color} />
          </section>

          <section>
            <h4 className={styles.section}>{t("detail.gps")}</h4>
            {coords ? (
              <Kv label={t("detail.coordinates")} value={coords} ltr />
            ) : (
              <p className={styles.muted}>{t("detail.noCoordinates")}</p>
            )}
            <Kv
              label={t("detail.speed")}
              value={
                gps.speedKph != null ? t("detail.speedValue", { value: Math.round(gps.speedKph) }) : null
              }
            />
            <Kv
              label={t("detail.heading")}
              value={gps.headingDegrees != null ? `${Math.round(gps.headingDegrees)}°` : null}
            />
            <Kv
              label={t("detail.accuracy")}
              value={
                gps.accuracyMeters != null
                  ? t("detail.accuracyValue", { value: Math.round(gps.accuracyMeters) })
                  : null
              }
            />
            <Kv
              label={t("detail.capturedAt")}
              value={
                gps.capturedAt
                  ? format.dateTime(new Date(gps.capturedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : null
              }
            />
            <Kv
              label={t("detail.receivedAt")}
              value={
                gps.receivedAt
                  ? format.dateTime(new Date(gps.receivedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : null
              }
            />
            {detail.binding.assigned ? (
              <Button
                type="button"
                variant="secondaryStrong"
                size="sm"
                onClick={onViewHistory}
              >
                {t("history.open")}
              </Button>
            ) : null}
          </section>

          <section aria-live="polite">
            <h4 className={styles.section}>{t("health.title")}</h4>
            {healthState.loading ? <p className={styles.muted}>{t("health.loading")}</p> : null}
            {healthState.error ? <p className={styles.error}>{t("health.unavailable")}</p> : null}
            {healthState.health ? (
              <>
                <div className={styles.healthRow}>
                  <Chip
                    tone={
                      healthState.health.health === "ONLINE"
                        ? "ok"
                        : healthState.health.health === "STALE"
                          ? "warn"
                          : "bad"
                    }
                    dot
                    solid
                  >
                    {t(`health.status.${healthState.health.health}`)}
                  </Chip>
                </div>
                <Kv
                  label={t("health.lastCommunication")}
                  value={
                    healthState.health.lastCommunicationAt
                      ? format.relativeTime(new Date(healthState.health.lastCommunicationAt), new Date())
                      : t("health.never")
                  }
                />
                <Kv
                  label={t("health.deviceModel")}
                  value={healthState.health.deviceModel ?? t("health.unavailableValue")}
                />
              </>
            ) : null}
          </section>

          {detail.binding.assigned ? (
            <>
              <section>
                <h4 className={styles.section}>{t("mileage.title")}</h4>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void reports.loadMileage(vehicle.id)}
                  disabled={reports.mileageLoading}
                >
                  {reports.mileageLoading ? t("mileage.loading") : t("mileage.load")}
                </Button>
                {reports.mileageError ? <p className={styles.error}>{reports.mileageError.message}</p> : null}
                {reports.mileage ? (
                  <div>
                    <Kv label={t("mileage.today")} value={`${reports.mileage.todayKm} km`} />
                    <Kv label={t("mileage.yesterday")} value={`${reports.mileage.yesterdayKm} km`} />
                    <Kv label={t("mileage.thisMonth")} value={`${reports.mileage.thisMonthKm} km`} />
                    <Kv label={t("mileage.lastMonth")} value={`${reports.mileage.lastMonthKm} km`} />
                  </div>
                ) : null}
              </section>

              <section>
                <h4 className={styles.section}>{t("overspeed.title")}</h4>
                <label>
                  <span>{t("overspeed.date")}</span>
                  <input
                    type="date"
                    value={overspeedDate}
                    onChange={(event) => setOverspeedDate(event.target.value)}
                    disabled={reports.overspeedLoading}
                  />
                </label>
                <label>
                  <span>{t("overspeed.threshold")}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={thresholdKph}
                    onChange={(event) => setThresholdKph(event.target.value)}
                    disabled={reports.overspeedLoading}
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void reports.loadOverspeed(vehicle.id, overspeedDate, Number(thresholdKph))}
                  disabled={reports.overspeedLoading || !overspeedDate || Number(thresholdKph) <= 0}
                >
                  {reports.overspeedLoading ? t("overspeed.loading") : t("overspeed.load")}
                </Button>
                {reports.overspeedError ? <p className={styles.error}>{reports.overspeedError.message}</p> : null}
                {reports.overspeed ? (
                  reports.overspeed.events.length ? (
                    <div>
                      {reports.overspeed.events.map((event, index) => (
                        <div key={`${event.startedAt}-${index}`}>
                          <Kv label={t("overspeed.start")} value={format.dateTime(new Date(event.startedAt), { dateStyle: "medium", timeStyle: "short" })} />
                          <Kv label={t("overspeed.end")} value={format.dateTime(new Date(event.endedAt), { dateStyle: "medium", timeStyle: "short" })} />
                          <Kv label={t("overspeed.duration")} value={`${event.durationMinutes} min`} />
                          <Kv label={t("overspeed.maxSpeed")} value={`${event.maxSpeedKph} km/h`} />
                          <Kv label={t("overspeed.averageSpeed")} value={`${event.averageSpeedKph} km/h`} />
                          <Kv label={t("overspeed.address")} value={event.addressLine} />
                        </div>
                      ))}
                    </div>
                  ) : <p className={styles.muted}>{t("overspeed.empty")}</p>
                ) : null}
              </section>
            </>
          ) : null}

          {rental ? (
            <section>
              <h4 className={styles.section}>{t("detail.rental")}</h4>
              <Kv label={t("detail.contract")} value={rental.contractNumber} ltr />
              <Kv label={t("detail.customer")} value={rental.customerName} />
              <Kv label={t("detail.rentalStatus")} value={t(`rental.${rental.status}`)} />
              <Kv
                label={t("detail.start")}
                value={
                  rental.startAt
                    ? format.dateTime(new Date(rental.startAt), { dateStyle: "medium" })
                    : null
                }
              />
              <Kv
                label={t("detail.end")}
                value={format.dateTime(new Date(rental.endAt), { dateStyle: "medium" })}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onViewContract(rental.contractId)}
              >
                {t("detail.viewContract")}
              </Button>
            </section>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
