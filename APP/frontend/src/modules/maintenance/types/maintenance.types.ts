/** Backend JSON statuses (`MaintenanceStatusDtoSchema`). */
export type MaintenanceStatus =
  | "scheduled"
  | "in_service"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

/** Backend JSON types (`MaintenanceTypeDtoSchema`). */
export type MaintenanceType =
  | "mechanical"
  | "electrical"
  | "tires"
  | "air_conditioning"
  | "body"
  | "periodic"
  | "other";

export type MaintenanceStartMode = "now" | "scheduled";

/**
 * Toolbar status chips. `overdue` is a derived list filter, not a persisted
 * order status. `all` means active orders (scheduled / in service / ready).
 */
export type MaintenanceStatusFilter =
  | "all"
  | "in_service"
  | "scheduled"
  | "ready_for_pickup"
  | "overdue"
  | "completed";

export type MaintenanceSortKey = "newest" | "scheduledAt" | "expectedCompletion";

export interface MaintenanceVehicleDto {
  id: number;
  vehicleName: string | null;
  displayName: string;
  plateNumber: string | null;
  modelYear: number | null;
  color: string | null;
  operationalStatus: "available" | "rented" | "service";
  primaryImageUrl: string | null;
}

export interface MaintenanceOrderDto {
  id: number;
  vehicleId: number;
  status: MaintenanceStatus;
  maintenanceType: MaintenanceType;
  issueDescription: string;
  scheduledAt: string | null;
  startedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  workshopName: string | null;
  odometerIn: number | null;
  expectedCompletionAt: string | null;
  notes: string | null;
  cost: number | null;
  overdue: boolean;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
  vehicle: MaintenanceVehicleDto;
}

export type MaintenanceOrderDetailDto = MaintenanceOrderDto;

export interface MaintenanceSummaryDto {
  inService: number;
  scheduled: number;
  readyForPickup: number;
  overdue: number;
  completedThisMonth: number;
  totalCost: number;
}

export interface MaintenanceFiltersState {
  status: MaintenanceStatusFilter;
  search: string;
  maintenanceType: MaintenanceType | null;
  sort: MaintenanceSortKey;
}

export interface MaintenanceListQuery extends MaintenanceFiltersState {
  page: number;
  pageSize: number;
}

export interface CreateMaintenancePayload {
  vehicleId: number;
  issueDescription: string;
  maintenanceType: MaintenanceType;
  startMode: MaintenanceStartMode;
  scheduledAt?: string;
  workshopName?: string;
  odometerIn?: number;
  expectedCompletionAt?: string;
  notes?: string;
  cost?: number;
}

export interface UpdateMaintenancePayload {
  issueDescription?: string;
  maintenanceType?: MaintenanceType;
  workshopName?: string | null;
  odometerIn?: number | null;
  expectedCompletionAt?: string | null;
  notes?: string | null;
  cost?: number | null;
  scheduledAt?: string;
}

export type MaintenanceLifecycleAction = "start" | "ready" | "complete" | "cancel";
