/**
 * Central normalization. Uniqueness checks and lookups must use the CANONICAL
 * value (paired with a DB unique index), not raw client input.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}
