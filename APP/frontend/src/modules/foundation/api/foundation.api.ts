import { apiRequest } from "@/infrastructure/api/client";
import type { ApiResponse } from "@/infrastructure/api/types";

export interface BackendHealth {
  status: string;
}

export function getBackendHealth(): Promise<ApiResponse<BackendHealth>> {
  return apiRequest<BackendHealth>("/health");
}
