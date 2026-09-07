import type { VehicleOperationalStatus } from "@prisma/client";
import type {
  VehicleCurrentRentalSchema,
  VehicleImage,
  VehicleOperationalStatusDto,
} from "src/modules/vehicles/vehicles.schema";
import type { z } from "zod";

type CurrentRental = z.infer<typeof VehicleCurrentRentalSchema>;

const STATUS_TO_DTO: Record<VehicleOperationalStatus, VehicleOperationalStatusDto> = {
  AVAILABLE: "available",
  RENTED: "rented",
  SERVICE: "service",
};

const STATUS_FROM_DTO: Record<VehicleOperationalStatusDto, VehicleOperationalStatus> = {
  available: "AVAILABLE",
  rented: "RENTED",
  service: "SERVICE",
};

export function operationalStatusToDto(
  status: VehicleOperationalStatus,
): VehicleOperationalStatusDto {
  return STATUS_TO_DTO[status];
}

export function operationalStatusFromDto(
  status: VehicleOperationalStatusDto,
): VehicleOperationalStatus {
  return STATUS_FROM_DTO[status];
}

type PhotoRow = {
  id: string;
  attachmentId: string;
  sortOrder: number;
  isPrimary: boolean;
  attachment: { mimeType: string };
};

export function photoStreamPath(vehicleId: number, photoId: string): string {
  return `/vehicles/${vehicleId}/photos/${photoId}/stream`;
}

export function toVehicleImage(vehicleId: number, row: PhotoRow): VehicleImage {
  return {
    id: row.id,
    attachmentId: row.attachmentId,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
    mimeType: row.attachment.mimeType,
    url: photoStreamPath(vehicleId, row.id),
  };
}

export function resolvePrimaryImage(
  vehicleId: number,
  photos: PhotoRow[],
): VehicleImage | null {
  if (!photos.length) return null;
  const sorted = [...photos].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  });
  return toVehicleImage(vehicleId, sorted[0]!);
}

/**
 * Contracts domain is not built yet — current rental summary stays null until
 * an authoritative rental contract model exists. Do not synthesize from history.
 */
export function resolveCurrentRental(_vehicleId: number): CurrentRental {
  return null;
}

type DisplayNameInput = {
  vehicleName: string | null;
  modelName: string | null;
  modelYear: number | null;
  plateNumber: string | null;
};

/**
 * Stable card/detail label: direct fleet name wins; legacy catalog model is the
 * fallback; plate number is the last resort when neither name source exists.
 */
export function vehicleDisplayName(input: DisplayNameInput): string {
  if (input.vehicleName) return input.vehicleName;
  if (input.modelName) {
    return input.modelYear ? `${input.modelName} ${input.modelYear}` : input.modelName;
  }
  if (input.plateNumber) return input.plateNumber;
  return "Vehicle";
}

/** Fleet type/name used for toolbar filtering (not the card displayName). */
export function fleetVehicleTypeLabel(
  vehicleName: string | null,
  modelName: string | null,
): string | null {
  const direct = vehicleName?.trim();
  if (direct) return direct;
  const legacy = modelName?.trim();
  return legacy || null;
}

export function normalizeFleetTypeKey(label: string): string {
  return label.trim().toLowerCase();
}
