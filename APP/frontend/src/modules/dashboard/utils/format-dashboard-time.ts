const DASHBOARD_BUSINESS_TIME_ZONE = "Asia/Dubai";

/** Contract creation time in the office business timezone (Asia/Dubai). */
export function formatDashboardBusinessTime(iso: string, locale: string): string {
  const instant = new Date(iso);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: DASHBOARD_BUSINESS_TIME_ZONE,
  }).format(instant);
}
