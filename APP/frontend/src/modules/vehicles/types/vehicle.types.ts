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

export type VehicleCurrentRentalStatus = "paid" | "active" | "retout";

export interface VehicleCurrentRentalDto {
  contractId: string;
  contractNumber?: string;
  customerName: string;
  endAt: string;
  status: VehicleCurrentRentalStatus;
  awaitingHandover?: boolean;
}

export type FleetAttentionTier = "handover" | "urgent_follow_up";

export interface VehiclePrePaymentFollowUpDto {
  contractId: string;
  contractNumber: string;
  status: "awaiting" | "form" | "signed";
  customerName: string | null;
}

export type ActiveMaintenanceOrderStatus = "SCHEDULED" | "IN_SERVICE" | "READY_FOR_PICKUP";

export interface VehicleActiveMaintenanceOrderDto {
  id: number;
  status: ActiveMaintenanceOrderStatus;
}

export interface VehicleModelRefDto {
  id: number;
  code: string;
  name: string;
}

export interface VehicleCompanyRefDto {
  id: number;
  code: string;
  displayName: string;
  accentColor: string;
}

export interface VehicleCardDto {
  id: number;
  vin: string | null;
  vehicleName: string | null;
  modelId: number | null;
  modelYear: number | null;
  color: string | null;
  plateNumber: string | null;
  hourlyRate: number | null;
  dailyRate: number | null;
  weeklyRate: number | null;
  monthlyRate: number | null;
  operationalStatus: VehicleOperationalStatus;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  company: VehicleCompanyRefDto;
  model: VehicleModelRefDto | null;
  primaryImage: VehicleImageDto | null;
  currentRental: VehicleCurrentRentalDto | null;
  fleetAttentionTier: FleetAttentionTier | null;
  prePaymentFollowUps: VehiclePrePaymentFollowUpDto[];
}

export interface VehicleDetailDto extends VehicleCardDto {
  gallery: VehicleImageDto[];
  activeMaintenanceOrder: VehicleActiveMaintenanceOrderDto | null;
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
  /** Operating Company id, or `null` for the complete fleet. */
  companyId: number | null;
  sort: VehicleSortKey;
}

export interface VehiclesListQuery extends Partial<VehicleFiltersState> {
  page?: number;
  pageSize?: number;
}

/** Payload for `POST /vehicles` (Backend permission: `vehicles.manage`). */
export interface CreateVehiclePayload {
  companyId: number;
  vehicleName: string;
  vin?: string;
  modelYear?: number;
  color?: string;
  plateNumber?: string;
  hourlyRate?: number;
  dailyRate?: number;
  weeklyRate?: number;
  monthlyRate?: number;
}

/** Partial payload for `PUT /vehicles/:id` default-rate updates. */
export interface UpdateVehicleRatesPayload {
  hourlyRate: number;
  dailyRate: number;
  weeklyRate: number;
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
  hourlyRate: number | null;
  dailyRate: number | null;
  weeklyRate: number | null;
  monthlyRate: number | null;
  operationalStatus: VehicleOperationalStatus;
  externalId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  company: VehicleCompanyRefDto;
}
