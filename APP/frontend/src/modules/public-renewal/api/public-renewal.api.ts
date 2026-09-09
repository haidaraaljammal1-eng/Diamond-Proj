import { apiRequest } from "@/infrastructure/api/client";
import type { PublicRenewalView } from "../types/public-renewal.types";

const CONTRACTS_PATH = "/contracts";

/** Public renewal calls never persist the token. Callers pass it from the route. */
export async function getPublicRenewal(token: string): Promise<PublicRenewalView> {
  const response = await apiRequest<PublicRenewalView>(
    `${CONTRACTS_PATH}/renew/${token}`,
  );
  return response.data;
}

/** Confirm applies the stored server offer. Client days/amount are not sent. */
export async function confirmPublicRenewal(token: string): Promise<PublicRenewalView> {
  const response = await apiRequest<PublicRenewalView>(
    `${CONTRACTS_PATH}/renew/${token}/confirm`,
    { method: "POST", body: {} },
  );
  return response.data;
}
