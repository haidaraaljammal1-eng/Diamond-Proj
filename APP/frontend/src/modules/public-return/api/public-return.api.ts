import { apiRequest } from "@/infrastructure/api/client";
import type { PublicReturnView } from "../types/public-return.types";

const CONTRACTS_PATH = "/contracts";

/** Public return calls never persist the token. Callers pass it from the route. */
export async function getPublicReturn(token: string): Promise<PublicReturnView> {
  const response = await apiRequest<PublicReturnView>(
    `${CONTRACTS_PATH}/return/${token}`,
    { publicRequest: true },
  );
  return response.data;
}

/** The hirer confirms the vehicle return: the Backend moves ACTIVE to RETOUT. */
export async function confirmPublicReturn(token: string): Promise<PublicReturnView> {
  const response = await apiRequest<PublicReturnView>(
    `${CONTRACTS_PATH}/return/${token}/confirm`,
    { method: "POST", publicRequest: true },
  );
  return response.data;
}
