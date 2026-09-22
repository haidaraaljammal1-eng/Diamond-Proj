import type { FinanceCompanyScopeSelection } from "../types/finance.types";

/** Query fragment for the existing Finance company contract. ALL adds nothing. */
export function financeCompanyScopeQuery(scope: FinanceCompanyScopeSelection): string {
  if (scope.kind === "COMPANY") {
    return `companyId=${encodeURIComponent(String(scope.companyId))}`;
  }
  if (scope.kind === "GENERAL") return "companyScope=GENERAL";
  return "";
}

export function appendFinanceCompanyScope(
  path: string,
  scope: FinanceCompanyScopeSelection,
): string {
  const extra = financeCompanyScopeQuery(scope);
  if (!extra) return path;
  return path.includes("?") ? `${path}&${extra}` : `${path}?${extra}`;
}

/** Latest request wins. An older in-flight response must not replace a newer scope. */
export function isLatestFinanceRequest(requestId: number, latestId: number): boolean {
  return requestId === latestId;
}
