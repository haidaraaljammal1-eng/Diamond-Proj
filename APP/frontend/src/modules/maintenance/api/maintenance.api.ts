import { apiRequest } from "@/infrastructure/api/client";
import type {
  CreateMaintenancePayload,
  MaintenanceListQuery,
  MaintenanceOrderDetailDto,
  MaintenanceSummaryDto,
  UpdateMaintenancePayload,
} from "../types/maintenance.types";
import { buildMaintenanceQuery } from "../utils/maintenance-filters";
import {
  MAINTENANCE_PAGE_SIZE,
  parsePageMeta,
  type PageMeta,
} from "./maintenance.api.types";

const MAINTENANCE_PATH = "/maintenance";

/** `GET /maintenance` (Backend permission: `maintenance.read`). */
export async function getMaintenanceList(
  params: MaintenanceListQuery & { statusOverride?: string } = {
    status: "all",
    search: "",
    maintenanceType: null,
    companyId: null,
    sort: "newest",
    page: 1,
    pageSize: MAINTENANCE_PAGE_SIZE,
  },
): Promise<{ data: MaintenanceOrderDetailDto[]; meta: PageMeta | null }> {
  const query = buildMaintenanceQuery({
    ...params,
    pageSize: params.pageSize ?? MAINTENANCE_PAGE_SIZE,
  });
  const response = await apiRequest<MaintenanceOrderDetailDto[]>(
    `${MAINTENANCE_PATH}?${query}`,
  );
  return { data: response.data, meta: parsePageMeta(response.meta) };
}

/** `GET /maintenance/summary` (Backend permission: `maintenance.read`). */
export async function getMaintenanceSummary(): Promise<MaintenanceSummaryDto> {
  const response = await apiRequest<MaintenanceSummaryDto>(
    `${MAINTENANCE_PATH}/summary`,
  );
  return response.data;
}

/** `GET /maintenance/:id` (Backend permission: `maintenance.read`). */
export async function getMaintenance(
  id: number,
): Promise<MaintenanceOrderDetailDto> {
  const response = await apiRequest<MaintenanceOrderDetailDto>(
    `${MAINTENANCE_PATH}/${id}`,
  );
  return response.data;
}

/** `POST /maintenance` (Backend permission: `maintenance.manage`). */
export async function createMaintenance(
  payload: CreateMaintenancePayload,
): Promise<MaintenanceOrderDetailDto> {
  const response = await apiRequest<MaintenanceOrderDetailDto>(MAINTENANCE_PATH, {
    method: "POST",
    body: payload,
  });
  return response.data;
}

/** `PATCH /maintenance/:id` (Backend permission: `maintenance.manage`). */
export async function updateMaintenance(
  id: number,
  payload: UpdateMaintenancePayload,
): Promise<MaintenanceOrderDetailDto> {
  const response = await apiRequest<MaintenanceOrderDetailDto>(
    `${MAINTENANCE_PATH}/${id}`,
    {
      method: "PATCH",
      body: payload,
    },
  );
  return response.data;
}

/** `POST /maintenance/:id/start` */
export async function startMaintenance(
  id: number,
): Promise<MaintenanceOrderDetailDto> {
  const response = await apiRequest<MaintenanceOrderDetailDto>(
    `${MAINTENANCE_PATH}/${id}/start`,
    { method: "POST" },
  );
  return response.data;
}

/** `POST /maintenance/:id/ready` */
export async function markMaintenanceReady(
  id: number,
): Promise<MaintenanceOrderDetailDto> {
  const response = await apiRequest<MaintenanceOrderDetailDto>(
    `${MAINTENANCE_PATH}/${id}/ready`,
    { method: "POST" },
  );
  return response.data;
}

/** `POST /maintenance/:id/complete` */
export async function completeMaintenance(
  id: number,
): Promise<MaintenanceOrderDetailDto> {
  const response = await apiRequest<MaintenanceOrderDetailDto>(
    `${MAINTENANCE_PATH}/${id}/complete`,
    { method: "POST" },
  );
  return response.data;
}

/** `POST /maintenance/:id/cancel` */
export async function cancelMaintenance(
  id: number,
): Promise<MaintenanceOrderDetailDto> {
  const response = await apiRequest<MaintenanceOrderDetailDto>(
    `${MAINTENANCE_PATH}/${id}/cancel`,
    { method: "POST" },
  );
  return response.data;
}
