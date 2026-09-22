/** All Companies omits `companyId`. Dashboard never sends `companyScope=GENERAL`. */
export function dashboardOverviewPath(companyId: number | null): string {
  if (companyId == null) return "/dashboard/overview";
  return `/dashboard/overview?companyId=${encodeURIComponent(String(companyId))}`;
}

export function isLatestDashboardRequest(requestId: number, latestId: number): boolean {
  return requestId === latestId;
}
