import type { ContractLinkType } from "../types/contract.types";

const LINK_PATH: Record<ContractLinkType, string> = {
  RENTAL: "rental",
  RETURN: "return",
  RENEWAL: "renew",
};

/**
 * Customer URL the staff copies/opens. Public pages are not built in V1;
 * the token and path are still the real Backend public-route contract.
 */
export function buildPublicContractUrl(
  origin: string,
  locale: string,
  type: ContractLinkType,
  token: string,
): string {
  const path = LINK_PATH[type];
  return `${origin.replace(/\/$/, "")}/${locale}/${path}/${token}`;
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
