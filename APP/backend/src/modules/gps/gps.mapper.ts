import type { GpsMotionState, Prisma, VehicleOperationalStatus } from "@prisma/client";
import { COMPANY_REF_SELECT } from "src/modules/operating-companies/company-ref";
import {
  fleetVehicleTypeLabel,
  operationalStatusToDto,
  resolvePrimaryImage,
  vehicleDisplayName,
} from "src/modules/vehicles/vehicles.mapper";
import type { CurrentRentalDto } from "src/modules/contracts/current-rental";
import type { GpsTrackingStatusDto } from "src/modules/gps/gps.constants";
import type {
  GpsBindingSnapshot,
  GpsLatestSnapshot,
  NormalizedGpsPositionInput,
} from "src/modules/gps/gps.types";
import type {
  GpsCurrentRental,
  GpsLocationProjection,
  GpsMapPoint,
  GpsVehicleDetail,
  GpsVehicleListItem,
  GpsVehicleSummary,
} from "src/modules/gps/gps.schema";
import {
  gpsInvalidAccuracyError,
  gpsInvalidCoordinatesError,
  gpsInvalidHeadingError,
  gpsInvalidSpeedError,
} from "src/modules/gps/gps.errors";

export const GPS_VEHICLE_INCLUDE = {
  company: { select: COMPANY_REF_SELECT },
  model: { select: { name: true } },
  photos: {
    orderBy: [
      { isPrimary: "desc" as const },
      { sortOrder: "asc" as const },
      { createdAt: "asc" as const },
    ],
    include: { attachment: { select: { mimeType: true } } },
  },
  gpsBinding: true,
  gpsLatestState: true,
} satisfies Prisma.VehicleInclude;

export type GpsVehicleRow = Prisma.VehicleGetPayload<{
  include: typeof GPS_VEHICLE_INCLUDE;
}>;

export type ValidatedGpsPosition = {
  latitude: number;
  longitude: number;
  speedKph: number | null;
  headingDegrees: number | null;
  accuracyMeters: number | null;
  sourceEventId: string | null;
  capturedAt: Date;
  receivedAt: Date;
};

function decimalToNumber(value: { toNumber: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

export function deriveMotionState(
  speedKph: number | null,
  movingThresholdKph: number,
): GpsMotionState {
  if (speedKph == null) return "UNKNOWN";
  return speedKph > movingThresholdKph ? "MOVING" : "PARKED";
}

export function offlineCutoff(now: Date, offlineAfterMinutes: number): Date {
  return new Date(now.getTime() - offlineAfterMinutes * 60_000);
}

/**
 * Single source of row-level tracking status for list, map, detail, and summary buckets.
 * OFFLINE is never persisted — it is derived from capturedAt vs the threshold.
 * Returning `"online"` means fresh location + motion UNKNOWN — not the summary Online KPI.
 */
export function deriveTrackingStatus(input: {
  providerConfigured: boolean;
  binding: GpsBindingSnapshot | null;
  latest: Pick<GpsLatestSnapshot, "capturedAt" | "motionState"> | null;
  now: Date;
  offlineAfterMinutes: number;
}): GpsTrackingStatusDto {
  if (!input.providerConfigured) return "not_configured";
  if (!input.binding?.isActive) return "unassigned";
  if (!input.latest) return "no_data";
  const cutoff = offlineCutoff(input.now, input.offlineAfterMinutes);
  if (input.latest.capturedAt.getTime() < cutoff.getTime()) return "offline";
  if (input.latest.motionState === "MOVING") return "moving";
  if (input.latest.motionState === "PARKED") return "parked";
  return "online";
}

/**
 * Summary KPI `online` = vehicles with a fresh GPS location.
 *
 * Row-level `trackingStatus === "online"` still means fresh + unknown motion.
 * Summary Online is the union of row-level moving, parked, and online.
 */
export function countsInSummaryOnlineTotal(
  trackingStatus: GpsTrackingStatusDto,
): boolean {
  return (
    trackingStatus === "moving" ||
    trackingStatus === "parked" ||
    trackingStatus === "online"
  );
}

export type GpsSummaryStatusTallies = {
  moving: number;
  parked: number;
  /** Fresh-location total (moving + parked + row-level online). */
  online: number;
  offline: number;
  noData: number;
};

export function tallyGpsSummaryStatuses(
  statuses: readonly GpsTrackingStatusDto[],
): GpsSummaryStatusTallies {
  let moving = 0;
  let parked = 0;
  let offline = 0;
  let noData = 0;
  for (const status of statuses) {
    if (status === "moving") moving += 1;
    else if (status === "parked") parked += 1;
    else if (status === "offline") offline += 1;
    else if (status === "no_data") noData += 1;
  }
  return {
    moving,
    parked,
    online: statuses.filter(countsInSummaryOnlineTotal).length,
    offline,
    noData,
  };
}

export function shouldApplyIncomingPosition(input: {
  existingCapturedAt: Date | null;
  existingSourceEventId: string | null;
  incomingCapturedAt: Date;
  incomingSourceEventId: string | null;
}): "apply" | "stale" | "duplicate_event" {
  if (
    input.incomingSourceEventId &&
    input.existingSourceEventId &&
    input.incomingSourceEventId === input.existingSourceEventId
  ) {
    return "duplicate_event";
  }
  if (
    input.existingCapturedAt &&
    input.incomingCapturedAt.getTime() <= input.existingCapturedAt.getTime()
  ) {
    return "stale";
  }
  return "apply";
}

export function validateNormalizedPosition(
  input: NormalizedGpsPositionInput,
  now: Date = new Date(),
): ValidatedGpsPosition {
  if (
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    throw gpsInvalidCoordinatesError();
  }

  const speedKph =
    input.speedKph === undefined || input.speedKph === null ? null : input.speedKph;
  if (speedKph != null && (!Number.isFinite(speedKph) || speedKph < 0)) {
    throw gpsInvalidSpeedError();
  }

  const headingDegrees =
    input.headingDegrees === undefined || input.headingDegrees === null
      ? null
      : input.headingDegrees;
  if (
    headingDegrees != null &&
    (!Number.isFinite(headingDegrees) || headingDegrees < 0 || headingDegrees >= 360)
  ) {
    throw gpsInvalidHeadingError();
  }

  const accuracyMeters =
    input.accuracyMeters === undefined || input.accuracyMeters === null
      ? null
      : input.accuracyMeters;
  if (accuracyMeters != null && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0)) {
    throw gpsInvalidAccuracyError();
  }

  const sourceEventId = input.sourceEventId?.trim() ? input.sourceEventId.trim() : null;

  return {
    latitude: input.latitude,
    longitude: input.longitude,
    speedKph,
    headingDegrees,
    accuracyMeters,
    sourceEventId,
    capturedAt: input.capturedAt,
    receivedAt: input.receivedAt ?? now,
  };
}

function motionToDto(
  state: GpsMotionState | null,
): GpsLocationProjection["motionState"] {
  if (!state) return null;
  if (state === "MOVING") return "moving";
  if (state === "PARKED") return "parked";
  return "unknown";
}

function snapshotFromRow(
  row: GpsVehicleRow["gpsLatestState"],
): GpsLatestSnapshot | null {
  if (!row) return null;
  return {
    latitude: decimalToNumber(row.latitude) ?? 0,
    longitude: decimalToNumber(row.longitude) ?? 0,
    speedKph: decimalToNumber(row.speedKph),
    headingDegrees: decimalToNumber(row.headingDegrees),
    accuracyMeters: decimalToNumber(row.accuracyMeters),
    motionState: row.motionState,
    capturedAt: row.capturedAt,
    receivedAt: row.receivedAt,
    sourceEventId: row.sourceEventId,
  };
}

function toVehicleSummary(row: GpsVehicleRow): GpsVehicleSummary {
  const displayName = vehicleDisplayName({
    vehicleName: row.vehicleName,
    modelName: row.model?.name ?? null,
    modelYear: row.modelYear,
    plateNumber: row.plateNumber,
  });
  return {
    id: row.id,
    company: row.company,
    vehicleName: row.vehicleName,
    displayName,
    vehicleType: fleetVehicleTypeLabel(row.vehicleName, row.model?.name ?? null),
    plateNumber: row.plateNumber,
    modelYear: row.modelYear,
    color: row.color,
    primaryImageUrl: resolvePrimaryImage(row.id, row.photos)?.url ?? null,
    operationalStatus: operationalStatusToDto(row.operationalStatus as VehicleOperationalStatus),
  };
}

function toGpsProjection(input: {
  providerConfigured: boolean;
  row: GpsVehicleRow;
  now: Date;
  offlineAfterMinutes: number;
}): GpsLocationProjection {
  const trackingStatus = deriveTrackingStatus({
    providerConfigured: input.providerConfigured,
    binding: input.row.gpsBinding,
    latest: snapshotFromRow(input.row.gpsLatestState),
    now: input.now,
    offlineAfterMinutes: input.offlineAfterMinutes,
  });

  const hideCoordinates =
    !input.providerConfigured ||
    trackingStatus === "not_configured" ||
    trackingStatus === "unassigned" ||
    trackingStatus === "no_data";
  const latest = snapshotFromRow(input.row.gpsLatestState);

  if (hideCoordinates || !latest) {
    return {
      trackingStatus,
      latitude: null,
      longitude: null,
      speedKph: null,
      headingDegrees: null,
      accuracyMeters: null,
      capturedAt: null,
      receivedAt: null,
      motionState: null,
    };
  }

  return {
    trackingStatus,
    latitude: latest.latitude,
    longitude: latest.longitude,
    speedKph: latest.speedKph,
    headingDegrees: latest.headingDegrees,
    accuracyMeters: latest.accuracyMeters,
    capturedAt: latest.capturedAt,
    receivedAt: latest.receivedAt,
    motionState: motionToDto(latest.motionState),
  };
}

export function toGpsCurrentRental(
  rental: CurrentRentalDto | null,
): GpsCurrentRental {
  if (!rental) return null;
  return {
    contractId: rental.contractId,
    contractNumber: rental.contractNumber,
    status: rental.status,
    startAt: rental.startAt,
    endAt: rental.endAt,
    customerName: rental.customerName,
  };
}

export function toGpsListItem(input: {
  row: GpsVehicleRow;
  rental: CurrentRentalDto | null;
  providerConfigured: boolean;
  now: Date;
  offlineAfterMinutes: number;
}): GpsVehicleListItem {
  return {
    vehicle: toVehicleSummary(input.row),
    gps: toGpsProjection(input),
    currentRental: toGpsCurrentRental(input.rental),
  };
}

export function toGpsDetail(input: {
  row: GpsVehicleRow;
  rental: CurrentRentalDto | null;
  providerConfigured: boolean;
  now: Date;
  offlineAfterMinutes: number;
}): GpsVehicleDetail {
  const item = toGpsListItem(input);
  const binding = input.row.gpsBinding;
  return {
    ...item,
    binding:
      binding && binding.isActive
        ? {
            assigned: true,
            providerKey: binding.providerKey,
            externalDeviceId: binding.externalDeviceId,
            isActive: binding.isActive,
          }
        : { assigned: false },
  };
}

export function toGpsMapPoint(input: {
  row: GpsVehicleRow;
  rental: CurrentRentalDto | null;
  providerConfigured: boolean;
  now: Date;
  offlineAfterMinutes: number;
}): GpsMapPoint | null {
  if (!input.providerConfigured) return null;
  const gps = toGpsProjection(input);
  if (gps.latitude == null || gps.longitude == null || gps.capturedAt == null) {
    return null;
  }
  const vehicle = toVehicleSummary(input.row);
  return {
    vehicleId: vehicle.id,
    company: vehicle.company,
    displayName: vehicle.displayName,
    plateNumber: vehicle.plateNumber,
    operationalStatus: vehicle.operationalStatus,
    trackingStatus: gps.trackingStatus,
    latitude: gps.latitude,
    longitude: gps.longitude,
    speedKph: gps.speedKph,
    headingDegrees: gps.headingDegrees,
    capturedAt: gps.capturedAt,
    currentRental: input.rental
      ? {
          contractId: input.rental.contractId,
          contractNumber: input.rental.contractNumber,
        }
      : null,
  };
}

export function trackingStatusWhere(
  trackingStatus: GpsTrackingStatusDto,
  providerConfigured: boolean,
  cutoff: Date,
): Prisma.VehicleWhereInput {
  if (!providerConfigured) {
    return trackingStatus === "not_configured" ? {} : { id: -1 };
  }
  switch (trackingStatus) {
    case "not_configured":
      return { id: -1 };
    case "unassigned":
      return {
        OR: [{ gpsBinding: null }, { gpsBinding: { isActive: false } }],
      };
    case "no_data":
      return {
        gpsBinding: { isActive: true },
        gpsLatestState: null,
      };
    case "offline":
      return {
        gpsBinding: { isActive: true },
        gpsLatestState: { capturedAt: { lt: cutoff } },
      };
    case "moving":
      return {
        gpsBinding: { isActive: true },
        gpsLatestState: {
          capturedAt: { gte: cutoff },
          motionState: "MOVING",
        },
      };
    case "parked":
      return {
        gpsBinding: { isActive: true },
        gpsLatestState: {
          capturedAt: { gte: cutoff },
          motionState: "PARKED",
        },
      };
    case "online":
      return {
        gpsBinding: { isActive: true },
        gpsLatestState: {
          capturedAt: { gte: cutoff },
          motionState: "UNKNOWN",
        },
      };
    default:
      return {};
  }
}
