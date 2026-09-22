import { apiRequest } from "@/infrastructure/api/client";
import type { PaymentCheckoutDto } from "@/modules/payments/types/payment.types";
import { publicRequestLocaleHeaders } from "@/modules/public-rental/utils/public-request-locale";
import type { PublicRenewalView } from "../types/public-renewal.types";

const CONTRACTS_PATH = "/contracts";

/** Public renewal calls never persist the token. Callers pass it from the route. */
export async function getPublicRenewal(token: string): Promise<PublicRenewalView> {
  const response = await apiRequest<PublicRenewalView>(
    `${CONTRACTS_PATH}/renew/${token}`,
    { publicRequest: true },
  );
  return response.data;
}

/** Confirm applies the stored server offer. Client days/amount are not sent. */
export async function confirmPublicRenewal(token: string): Promise<PublicRenewalView> {
  const response = await apiRequest<PublicRenewalView>(
    `${CONTRACTS_PATH}/renew/${token}/confirm`,
    { method: "POST", body: {}, publicRequest: true },
  );
  return response.data;
}

/** Starts Stripe checkout for an approved renewal offer. Amount is server-derived. */
export async function startPublicRenewalPayment(token: string): Promise<PaymentCheckoutDto> {
  const response = await apiRequest<PaymentCheckoutDto>(
    `${CONTRACTS_PATH}/renew/${token}/payment`,
    {
      method: "POST",
      body: {},
      headers: publicRequestLocaleHeaders(),
      publicRequest: true,
    },
  );
  return response.data;
}
