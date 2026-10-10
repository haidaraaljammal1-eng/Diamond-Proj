import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import {
  VehicleCompanyRefSchema,
  VehicleOperationalStatusDtoSchema,
} from "src/modules/vehicles/vehicles.schema";
import { GPS_TRACKING_STATUSES } from "src/modules/gps/gps.constants";

export const GpsTrackingStatusDtoSchema = z.enum(GPS_TRACKING_STATUSES);
export type GpsTrackingStatusDto = z.infer<typeof GpsTrackingStatusDtoSchema>;

export const GpsMotionStateDtoSchema = z.enum(["unknown", "moving", "parked"]);

export const GpsLocationProjectionSchema = z.object({
  trackingStatus: GpsTrackingStatusDtoSchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  speedKph: z.number().nullable(),
  headingDegrees: z.number().nullable(),
  accuracyMeters: z.number().nullable(),
  capturedAt: z.date().nullable(),
  receivedAt: z.date().nullable(),
  motionState: GpsMotionStateDtoSchema.nullable(),
});
export type GpsLocationProjection = z.infer<typeof GpsLocationProjectionSchema>;

export const GpsVehicleSummarySchema = z.object({
  id: z.number().int(),
  /**
   * Owning company, read from the Vehicle. Diamond business metadata only: it
   * is never persisted in GPS state and never sent to a GPS vendor.
   */
  company: VehicleCompanyRefSchema,
  vehicleName: z.string().nullable(),
  displayName: z.string(),
  vehicleType: z.string().nullable(),
  plateNumber: z.string().nullable(),
  modelYear: z.number().int().nullable(),
  color: z.string().nullable(),
  primaryImageUrl: z.string().nullable(),
  operationalStatus: VehicleOperationalStatusDtoSchema,
});
export type GpsVehicleSummary = z.infer<typeof GpsVehicleSummarySchema>;

export const GpsCurrentRentalSchema = z
  .object({
    contractId: z.string(),
    contractNumber: z.string(),
    status: z.enum(["paid", "active", "retout"]),
    startAt: z.date().nullable(),
    endAt: z.date(),
    customerName: z.string(),
  })
  .nullable();
export type GpsCurrentRental = z.infer<typeof GpsCurrentRentalSchema>;

export const GpsMapCurrentRentalSchema = z
  .object({
    contractId: z.string(),
    contractNumber: z.string(),
  })
  .nullable();

export const GpsVehicleListItemSchema = z.object({
  vehicle: GpsVehicleSummarySchema,
  gps: GpsLocationProjectionSchema,
  currentRental: GpsCurrentRentalSchema,
});
export type GpsVehicleListItem = z.infer<typeof GpsVehicleListItemSchema>;

export const GpsBindingProjectionSchema = z.discriminatedUnion("assigned", [
  z.object({
    assigned: z.literal(true),
  }),
  z.object({ assigned: z.literal(false) }),
]);

export const GpsVehicleDetailSchema = GpsVehicleListItemSchema.extend({
  binding: GpsBindingProjectionSchema,
});
export type GpsVehicleDetail = z.infer<typeof GpsVehicleDetailSchema>;

export const GpsMapPointSchema = z.object({
  vehicleId: z.number().int(),
  company: VehicleCompanyRefSchema,
  displayName: z.string(),
  plateNumber: z.string().nullable(),
  operationalStatus: VehicleOperationalStatusDtoSchema,
  trackingStatus: GpsTrackingStatusDtoSchema,
  latitude: z.number(),
  longitude: z.number(),
  speedKph: z.number().nullable(),
  headingDegrees: z.number().nullable(),
  capturedAt: z.date(),
  currentRental: GpsMapCurrentRentalSchema,
});
export type GpsMapPoint = z.infer<typeof GpsMapPointSchema>;

export const GpsSummarySchema = z.object({
  providerConfigured: z.boolean(),
  totalVehicles: z.number().int(),
  trackedVehicles: z.number().int(),
  moving: z.number().int(),
  parked: z.number().int(),
  /** Fresh-location total (moving + parked + row-level online). Not the same as trackingStatus "online". */
  online: z.number().int(),
  offline: z.number().int(),
  noData: z.number().int(),
  unassigned: z.number().int(),
  lastLocationUpdateAt: z.date().nullable(),
});
export type GpsSummary = z.infer<typeof GpsSummarySchema>;

export const ListGpsVehiclesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["all", "available", "rented", "service"]).optional().default("all"),
  trackingStatus: GpsTrackingStatusDtoSchema.optional(),
  /** Owning-company filter. Applied to Vehicle.companyId inside Diamond only. */
  companyId: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
});
export type ListGpsVehiclesQuery = z.infer<typeof ListGpsVehiclesQuerySchema>;

export const GpsVehicleIdParam = z.object({
  vehicleId: z.coerce.number().int().positive(),
});

export const GpsHealthStatusSchema = z.enum(["ONLINE", "STALE", "OFFLINE"]);
export const GpsVehicleHealthSchema = z.object({
  vehicleId: z.number().int().positive(),
  health: GpsHealthStatusSchema,
  lastCommunicationAt: z.date().nullable(),
  ageSeconds: z.number().int().nonnegative().nullable(),
  deviceModel: z.string().nullable(),
});
export type GpsVehicleHealth = z.infer<typeof GpsVehicleHealthSchema>;

export const GpsHistoryQuerySchema = z.object({
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
});
export type GpsHistoryQuery = z.infer<typeof GpsHistoryQuerySchema>;

export const GpsOverspeedQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  thresholdKph: z.coerce.number().finite().positive(),
});
export type GpsOverspeedQuery = z.infer<typeof GpsOverspeedQuerySchema>;

export const GpsMileageSummarySchema = z.object({
  vehicleId: z.number().int().positive(),
  todayKm: z.number().nonnegative(),
  yesterdayKm: z.number().nonnegative(),
  thisMonthKm: z.number().nonnegative(),
  lastMonthKm: z.number().nonnegative(),
});
export type GpsMileageSummary = z.infer<typeof GpsMileageSummarySchema>;

export const GpsOverspeedEventSchema = z.object({
  startedAt: z.date(),
  endedAt: z.date(),
  averageSpeedKph: z.number().nonnegative(),
  maxSpeedKph: z.number().nonnegative(),
  durationMinutes: z.number().nonnegative(),
  addressLine: z.string().nullable(),
});

export const GpsOverspeedSchema = z.object({
  vehicleId: z.number().int().positive(),
  thresholdKph: z.number().positive(),
  date: z.string(),
  events: z.array(GpsOverspeedEventSchema),
  eventCount: z.number().int().nonnegative(),
});
export type GpsOverspeed = z.infer<typeof GpsOverspeedSchema>;

export const GpsHistoryPointSchema = z.object({
  capturedAt: z.date(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speedKph: z.number().nonnegative().nullable(),
  segmentDistanceMeters: z.number().nonnegative().nullable(),
  addressLine: z.string().nullable(),
});

export const GpsHistorySummarySchema = z.object({
  pointCount: z.number().int().nonnegative(),
  totalDistanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  maxSpeedKph: z.number().nonnegative().nullable(),
});

export const GpsVehicleHistorySchema = z.object({
  vehicleId: z.number().int().positive(),
  from: z.date(),
  to: z.date(),
  points: z.array(GpsHistoryPointSchema),
  summary: GpsHistorySummarySchema,
});
export type GpsVehicleHistory = z.infer<typeof GpsVehicleHistorySchema>;
