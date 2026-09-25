import type { ContractLinkType } from "../types/contract.types";

const LINK_PATH: Record<ContractLinkType, string> = {
  RENTAL: "rental",
  RETURN: "return",
  RENEWAL: "renew",
  RECONCILIATION: "reconciliation",
};

/**
 * Customer URL the staff copies or opens. Rental, return, and renewal public
 * pages live at `/[locale]/rental|return|renew/[token]`. Open Link remains a
 * Development / QA preview, not an operational staff action.
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
