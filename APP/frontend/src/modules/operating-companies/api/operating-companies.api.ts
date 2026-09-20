import { apiRequest } from "@/infrastructure/api/client";
import type { OperatingCompanyDto } from "../types/operating-company.types";

export async function getOperatingCompanies(): Promise<OperatingCompanyDto[]> {
  const response = await apiRequest<OperatingCompanyDto[]>("/operating-companies");
  return response.data;
}
