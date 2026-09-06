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

export interface VehicleCurrentRentalDto {
  contractId: string;
  customerName: string;
  endAt: string;
  status: "active" | "retout" | "review";
}

export interface VehicleModelRefDto {
  id: number;
  code: string;
  name: string;
}

export interface VehicleCardDto {
  id: number;
  vin: string | null;
  modelId: number;
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
  model: VehicleModelRefDto;
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
  /** Vehicle model id, or `null` for every model. */
  modelId: number | null;
  /** Include vehicles retired from the fleet (`isActive = false`). */
  includeInactive: boolean;
  sort: VehicleSortKey;
}

export interface VehiclesListQuery extends Partial<VehicleFiltersState> {
  page?: number;
  pageSize?: number;
}
