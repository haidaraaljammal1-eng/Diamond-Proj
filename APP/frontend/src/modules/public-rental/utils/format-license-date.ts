/** Backend stores license expiry as YYYY-MM-DD. Display DD/MM/YYYY. */
export function formatLicenseExpiry(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
