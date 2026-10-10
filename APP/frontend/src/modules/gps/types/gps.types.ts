import type { VehicleCompanyRefDto } from "@/modules/vehicles/types/vehicle.types";

export type GpsOperationalStatus = "available" | "rented" | "service";

export type GpsTrackingStatus =
  | "not_configured"
  | "unassigned"
  | "no_data"
  | "moving"
  | "parked"
  | "online"
  | "offline";

export type GpsMotionState = "unknown" | "moving" | "parked";

export type GpsOperationalFilter = "all" | "available" | "rented" | "service";

export type GpsTrackingFilter = "all" | GpsTrackingStatus;

export type GpsRentalStatus = "paid" | "active" | "retout";

export interface GpsLocationDto {
  trackingStatus: GpsTrackingStatus;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  headingDegrees: number | null;
  accuracyMeters: number | null;
  capturedAt: string | null;
  receivedAt: string | null;
  motionState: GpsMotionState | null;
}

export interface GpsVehicleSummaryDto {
  id: number;
  /**
   * Owning company, projected by the Backend from the Vehicle. Diamond business
   * metadata only: GPS state persists no company and no vendor ever sees one.
   */
  company: VehicleCompanyRefDto;
  vehicleName: string | null;
  displayName: string;
  vehicleType: string | null;
  plateNumber: string | null;
  modelYear: number | null;
  color: string | null;
  primaryImageUrl: string | null;
  operationalStatus: GpsOperationalStatus;
}

export interface GpsCurrentRentalDto {
  contractId: string;
  contractNumber: string;
  status: GpsRentalStatus;
  startAt: string | null;
  endAt: string;
  customerName: string;
}

export interface GpsVehicleListItemDto {
  vehicle: GpsVehicleSummaryDto;
  gps: GpsLocationDto;
  currentRental: GpsCurrentRentalDto | null;
}

export type GpsBindingDto =
  | { assigned: true }
  | { assigned: false };

export interface GpsVehicleDetailDto extends GpsVehicleListItemDto {
  binding: GpsBindingDto;
}

export type GpsHealthStatus = "ONLINE" | "STALE" | "OFFLINE";

export interface GpsVehicleHealthDto {
  vehicleId: number;
  health: GpsHealthStatus;
  lastCommunicationAt: string | null;
  ageSeconds: number | null;
  deviceModel: string | null;
}

export interface GpsMapPointDto {
  vehicleId: number;
  /**
   * Null only on a Demo Simulation overlay point that has no real vehicle row
   * behind it — the simulation must never invent a company.
   */
  company: VehicleCompanyRefDto | null;
  displayName: string;
  plateNumber: string | null;
  operationalStatus: GpsOperationalStatus;
  trackingStatus: GpsTrackingStatus;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  headingDegrees: number | null;
  capturedAt: string;
  currentRental: {
    contractId: string;
    contractNumber: string;
  } | null;
}

export interface GpsSummaryDto {
  providerConfigured: boolean;
  totalVehicles: number;
  trackedVehicles: number;
  moving: number;
  parked: number;
  /** Fresh-location total (moving + parked + row-level online). */
  online: number;
  offline: number;
  noData: number;
  unassigned: number;
  lastLocationUpdateAt: string | null;
}

export interface GpsListQuery {
  search: string;
  status: GpsOperationalFilter;
  trackingStatus: GpsTrackingFilter;
  /** Owning-company filter (Vehicle.companyId); null means All Companies. */
  companyId: number | null;
  page: number;
  pageSize: number;
}

export interface GpsPageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GpsHistoryPointDto {
  capturedAt: string;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  segmentDistanceMeters: number | null;
  addressLine: string | null;
}

export interface GpsHistorySummaryDto {
  pointCount: number;
  totalDistanceMeters: number;
  durationSeconds: number;
  maxSpeedKph: number | null;
}

export interface GpsVehicleHistoryDto {
  vehicleId: number;
  from: string;
  to: string;
  points: GpsHistoryPointDto[];
  summary: GpsHistorySummaryDto;
}

export interface GpsMileageSummaryDto {
  vehicleId: number;
  todayKm: number;
  yesterdayKm: number;
  thisMonthKm: number;
  lastMonthKm: number;
}

export interface GpsOverspeedEventDto {
  startedAt: string;
  endedAt: string;
  averageSpeedKph: number;
  maxSpeedKph: number;
  durationMinutes: number;
  addressLine: string | null;
}

export interface GpsOverspeedDto {
  vehicleId: number;
  thresholdKph: number;
  date: string;
  events: GpsOverspeedEventDto[];
  eventCount: number;
}

export interface GpsHistoryRange {
  from: string;
  to: string;
}

export type GpsHistoryPreset = "last1h" | "last6h" | "last24h" | "custom";
export type GpsPlaybackSpeed = "1" | "2" | "4" | "8";

export const GPS_PAGE_SIZE = 8;

export const GPS_TRACKING_FILTERS: GpsTrackingFilter[] = [
  "all",
  "moving",
  "parked",
  "online",
  "offline",
  "no_data",
  "unassigned",
];

export const GPS_OPERATIONAL_FILTERS: GpsOperationalFilter[] = [
  "all",
  "available",
  "rented",
  "service",
];
