import { apiRequest } from "@/infrastructure/api/client";
import type { DashboardOverviewDto } from "../types/dashboard.types";

/** `GET /dashboard/overview` (Backend permission: `dashboard.read`). */
export async function getDashboardOverview(): Promise<DashboardOverviewDto> {
  const response = await apiRequest<DashboardOverviewDto>("/dashboard/overview");
  return response.data;
}
