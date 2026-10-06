import { env } from "../../../config/env.ts";
import type { PublicRentalContext } from "../types/public-rental.types";

const CONTRACTS_PATH = "/contracts";

export function publicPassportPreviewApiUrl(token: string): string {
  return `${env.apiUrl}${CONTRACTS_PATH}/rental/${encodeURIComponent(token)}/passport/preview`;
}

/**
 * Prefer the in-memory object URL from the latest capture; otherwise use the
 * token-scoped server preview when an active passport document exists.
 */
export function resolvePassportPreviewUrl(
  token: string,
  context: PublicRentalContext,
  localObjectUrl: string | null,
): string | null {
  if (localObjectUrl) return localObjectUrl;
  if (!context.identity?.passport.previewAvailable) return null;
  const number = context.identity.passport.fields?.passportNumber?.trim();
  const query = number ? `?v=${encodeURIComponent(number)}` : "";
  return `${publicPassportPreviewApiUrl(token)}${query}`;
}
