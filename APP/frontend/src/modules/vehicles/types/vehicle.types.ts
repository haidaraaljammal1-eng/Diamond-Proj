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

export interface VehiclesListQuery {
  page?: number;
  pageSize?: number;
  status?: VehicleStatusFilter;
}
