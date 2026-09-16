import type {
  MaintenanceOrderStatus,
  MaintenanceType,
  Prisma,
  VehicleOperationalStatus,
} from "@prisma/client";
import {
  operationalStatusToDto,
  resolvePrimaryImage,
  vehicleDisplayName,
} from "src/modules/vehicles/vehicles.mapper";
import type {
  MaintenanceOrderDetailDto,
  MaintenanceOrderDto,
  MaintenanceStatusDto,
  MaintenanceTypeDto,
} from "src/modules/maintenance/maintenance.schema";

const STATUS_TO_DTO: Record<MaintenanceOrderStatus, MaintenanceStatusDto> = {
  SCHEDULED: "scheduled",
  IN_SERVICE: "in_service",
  READY_FOR_PICKUP: "ready_for_pickup",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const STATUS_FROM_DTO: Record<MaintenanceStatusDto, MaintenanceOrderStatus> = {
  scheduled: "SCHEDULED",
  in_service: "IN_SERVICE",
  ready_for_pickup: "READY_FOR_PICKUP",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const TYPE_TO_DTO: Record<MaintenanceType, MaintenanceTypeDto> = {
  MECHANICAL: "mechanical",
  ELECTRICAL: "electrical",
  TIRES: "tires",
  AIR_CONDITIONING: "air_conditioning",
  BODY: "body",
  PERIODIC: "periodic",
  OTHER: "other",
};

const TYPE_FROM_DTO: Record<MaintenanceTypeDto, MaintenanceType> = {
  mechanical: "MECHANICAL",
  electrical: "ELECTRICAL",
  tires: "TIRES",
  air_conditioning: "AIR_CONDITIONING",
  body: "BODY",
  periodic: "PERIODIC",
  other: "OTHER",
};

export function maintenanceStatusToDto(
  status: MaintenanceOrderStatus,
): MaintenanceStatusDto {
  return STATUS_TO_DTO[status];
}

export function maintenanceStatusFromDto(
  status: MaintenanceStatusDto,
): MaintenanceOrderStatus {
  return STATUS_FROM_DTO[status];
}

export function maintenanceTypeToDto(type: MaintenanceType): MaintenanceTypeDto {
  return TYPE_TO_DTO[type];
}

export function maintenanceTypeFromDto(type: MaintenanceTypeDto): MaintenanceType {
  return TYPE_FROM_DTO[type];
}

type VehicleProjectionRow = {
  id: number;
  vehicleName: string | null;
  plateNumber: string | null;
  modelYear: number | null;
  color: string | null;
  operationalStatus: VehicleOperationalStatus;
  model: { name: string } | null;
  photos: Array<{
    id: string;
    attachmentId: string;
    sortOrder: number;
    isPrimary: boolean;
    attachment: { mimeType: string };
  }>;
};

export const MAINTENANCE_VEHICLE_INCLUDE = {
  model: { select: { name: true } },
  photos: {
    orderBy: [
      { isPrimary: "desc" as const },
      { sortOrder: "asc" as const },
      { createdAt: "asc" as const },
    ],
    include: { attachment: { select: { mimeType: true } } },
  },
} satisfies Prisma.VehicleInclude;

export type MaintenanceOrderRow = Prisma.MaintenanceOrderGetPayload<{
  include: { vehicle: { include: typeof MAINTENANCE_VEHICLE_INCLUDE } };
}>;

export function isMaintenanceOverdue(
  row: Pick<
    MaintenanceOrderRow,
    "status" | "scheduledAt" | "expectedCompletionAt"
  >,
  now: Date = new Date(),
): boolean {
  if (row.status === "COMPLETED" || row.status === "CANCELLED") return false;
  if (row.status === "SCHEDULED" && row.scheduledAt) {
    return row.scheduledAt.getTime() < now.getTime();
  }
  if (
    (row.status === "IN_SERVICE" || row.status === "READY_FOR_PICKUP") &&
    row.expectedCompletionAt
  ) {
    return row.expectedCompletionAt.getTime() < now.getTime();
  }
  return false;
}

function toVehicleProjection(vehicle: VehicleProjectionRow) {
  const primary = resolvePrimaryImage(vehicle.id, vehicle.photos);
  return {
    id: vehicle.id,
    vehicleName: vehicle.vehicleName,
    displayName: vehicleDisplayName({
      vehicleName: vehicle.vehicleName,
      modelName: vehicle.model?.name ?? null,
      modelYear: vehicle.modelYear,
      plateNumber: vehicle.plateNumber,
    }),
    plateNumber: vehicle.plateNumber,
    modelYear: vehicle.modelYear,
    color: vehicle.color,
    operationalStatus: operationalStatusToDto(vehicle.operationalStatus),
    primaryImageUrl: primary?.url ?? null,
  };
}

export function toMaintenanceOrder(
  row: MaintenanceOrderRow,
  now: Date = new Date(),
): MaintenanceOrderDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    status: maintenanceStatusToDto(row.status),
    maintenanceType: maintenanceTypeToDto(row.maintenanceType),
    issueDescription: row.issueDescription,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    readyAt: row.readyAt,
    completedAt: row.completedAt,
    workshopName: row.workshopName,
    odometerIn: row.odometerIn,
    expectedCompletionAt: row.expectedCompletionAt,
    notes: row.notes,
    cost: row.cost,
    overdue: isMaintenanceOverdue(row, now),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    vehicle: toVehicleProjection(row.vehicle),
  };
}

export function toMaintenanceDetail(
  row: MaintenanceOrderRow,
  now: Date = new Date(),
): MaintenanceOrderDetailDto {
  return toMaintenanceOrder(row, now);
}
