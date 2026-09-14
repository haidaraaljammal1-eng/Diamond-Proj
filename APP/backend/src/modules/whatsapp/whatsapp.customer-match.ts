import { normalizePhone } from "src/lib/security/normalize";

/** Digit-only compare after existing `normalizePhone`. No country-code guessing. */
export function phoneDigitsForMatch(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizePhone(value);
  const digits = normalized.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export type WhatsAppCustomerMatchState = "NO_MATCH" | "NO_SAFE_MATCH" | "ONE_MATCH" | "AMBIGUOUS";

export function classifyExactPhoneMatches(count: number): WhatsAppCustomerMatchState {
  if (count <= 0) return "NO_MATCH";
  if (count === 1) return "ONE_MATCH";
  return "AMBIGUOUS";
}
