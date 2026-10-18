/** Day/month/year order (not US month/day), Asia/Dubai wall time. */
export function formatReturnedContractCarInDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dubai",
  }).format(new Date(iso));
}
