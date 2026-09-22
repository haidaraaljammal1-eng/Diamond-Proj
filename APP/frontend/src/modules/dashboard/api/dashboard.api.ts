import { apiRequest } from "@/infrastructure/api/client";
import type { DashboardOverviewDto } from "../types/dashboard.types";
import { dashboardOverviewPath } from "../utils/dashboard-company-scope";

/** `GET /dashboard/overview` (Backend permission: `dashboard.read`). */
export async function getDashboardOverview(
  companyId: number | null = null,
): Promise<DashboardOverviewDto> {
  const response = await apiRequest<DashboardOverviewDto>(dashboardOverviewPath(companyId));
  return response.data;
}
