"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Chip } from "@/shared/components/ui/chip";
import { Drawer } from "@/shared/components/ui/drawer";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
import { VehicleStatus } from "@/modules/vehicles/components/vehicle-status/vehicle-status";
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
  onViewContract,
}: GpsDetailDrawerProps) {
  const t = useTranslations("Gps");
  const format = useFormatter();
  const vehicle = detail?.vehicle;
  const gps = detail?.gps;
  const rental = detail?.currentRental;
  const coords =
    gps && hasMapCoordinates(gps.latitude, gps.longitude)
      ? formatGpsCoordinates(gps.latitude!, gps.longitude!)
      : null;

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
          </section>

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
