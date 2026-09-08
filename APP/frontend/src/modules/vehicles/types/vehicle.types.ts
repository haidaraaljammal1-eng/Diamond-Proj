/** Demo-aligned operational status values (stable API contract). */
export type VehicleOperationalStatus = "available" | "rented" | "service";

export type VehicleStatusFilter = "all" | VehicleOperationalStatus;

export interface VehicleImageDto {
  id: string;
  attachmentId: string;
  sortOrder: number;
  isPrimary: boolean;
  mimeType: string;
  /** Authenticated download path (`vehicles.read`). */
  url: string;
}

export type VehicleCurrentRentalStatus = "paid" | "active" | "retout" | "review";

export interface VehicleCurrentRentalDto {
  contractId: string;
  customerName: string;
  endAt: string;
  status: VehicleCurrentRentalStatus;
}

export interface VehicleModelRefDto {
  id: number;
  code: string;
  name: string;
}

export interface VehicleCardDto {
  id: number;
  vin: string | null;
  vehicleName: string | null;
  modelId: number | null;
  modelYear: number | null;
  color: string | null;
  plateNumber: string | null;
  dailyRate: number | null;
  monthlyRate: number | null;
  operationalStatus: VehicleOperationalStatus;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  model: VehicleModelRefDto | null;
  primaryImage: VehicleImageDto | null;
  currentRental: VehicleCurrentRentalDto | null;
}

export interface VehicleDetailDto extends VehicleCardDto {
  gallery: VehicleImageDto[];
}

/** Fleet ordering presets (mapped to the Backend `sort` param). */
export type VehicleSortKey =
  | "newest"
  | "priceAsc"
  | "priceDesc"
  | "yearDesc"
  | "plate";

/** Everything the fleet toolbar can narrow by. */
export interface VehicleFiltersState {
  status: VehicleStatusFilter;
  /** Free text — Backend matches plate, VIN, external id and model name. */
  search: string;
  /** Fleet vehicle type/name from server filter options, or `null` for all. */
  vehicleType: string | null;
  sort: VehicleSortKey;
}

export interface VehiclesListQuery extends Partial<VehicleFiltersState> {
  page?: number;
  pageSize?: number;
}

/** Payload for `POST /vehicles` (Backend permission: `vehicles.manage`). */
export interface CreateVehiclePayload {
  vehicleName: string;
  vin?: string;
  modelYear?: number;
  color?: string;
  plateNumber?: string;
  dailyRate?: number;
  monthlyRate?: number;
}

/** Partial payload for `PUT /vehicles/:id` default-rate updates. */
export interface UpdateVehicleRatesPayload {
  dailyRate: number;
  monthlyRate: number;
}

export interface VehiclePublicDto {
  id: number;
  vin: string | null;
  vehicleName: string | null;
  modelId: number | null;
  modelYear: number | null;
  color: string | null;
  plateNumber: string | null;
  dailyRate: number | null;
  monthlyRate: number | null;
  operationalStatus: VehicleOperationalStatus;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
