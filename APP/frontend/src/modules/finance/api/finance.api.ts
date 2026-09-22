import { apiRequest } from "@/infrastructure/api/client";
import {
  ALL_FINANCE_SCOPE,
  type CorrectManualExpensePayload,
  type CreateManualExpensePayload,
  type FinanceAnalyticsDto,
  type FinanceCompanyScopeSelection,
  type FinanceSummaryDto,
  type LedgerEntryDto,
  type LedgerQuery,
  type ManualExpenseDetailDto,
  type OpenReceivableDto,
  type OpenReceivablesQuery,
  type VoidManualExpensePayload,
} from "../types/finance.types";
import { appendFinanceCompanyScope } from "../utils/finance-company-scope";
import {
  FINANCE_LEDGER_PAGE_SIZE,
  FINANCE_RECEIVABLES_PAGE_SIZE,
  parsePageMeta,
  type PageMeta,
} from "./finance.api.types";

const FINANCE_PATH = "/finance";

function buildPeriodQuery(from: string, to: string): string {
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

/** `GET /finance/summary` (Backend permission: `finance.read`). */
export async function getFinanceSummary(
  from: string,
  to: string,
  scope: FinanceCompanyScopeSelection = ALL_FINANCE_SCOPE,
): Promise<FinanceSummaryDto> {
  const response = await apiRequest<FinanceSummaryDto>(
    appendFinanceCompanyScope(`${FINANCE_PATH}/summary?${buildPeriodQuery(from, to)}`, scope),
  );
  return response.data;
}

/** `GET /finance/analytics` (Backend permission: `finance.read`). */
export async function getFinanceAnalytics(
  from: string,
  to: string,
  scope: FinanceCompanyScopeSelection = ALL_FINANCE_SCOPE,
): Promise<FinanceAnalyticsDto> {
  const response = await apiRequest<FinanceAnalyticsDto>(
    appendFinanceCompanyScope(`${FINANCE_PATH}/analytics?${buildPeriodQuery(from, to)}`, scope),
  );
  return response.data;
}

/** `GET /finance/open-receivables` (Backend permission: `finance.read`). */
export async function getOpenReceivables(
  query: OpenReceivablesQuery,
  scope: FinanceCompanyScopeSelection = ALL_FINANCE_SCOPE,
): Promise<{ data: OpenReceivableDto[]; meta: PageMeta | null }> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize ?? FINANCE_RECEIVABLES_PAGE_SIZE),
    sort: query.sort,
  });
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.sourceType) params.set("sourceType", query.sourceType);

  const response = await apiRequest<OpenReceivableDto[]>(
    appendFinanceCompanyScope(`${FINANCE_PATH}/open-receivables?${params.toString()}`, scope),
  );
  return { data: response.data, meta: parsePageMeta(response.meta) };
}

/** `GET /finance/ledger` (Backend permission: `finance.read`). */
export async function getFinanceLedger(
  query: LedgerQuery,
  scope: FinanceCompanyScopeSelection = ALL_FINANCE_SCOPE,
): Promise<{ data: LedgerEntryDto[]; meta: PageMeta | null }> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize ?? FINANCE_LEDGER_PAGE_SIZE),
    from: query.from,
    to: query.to,
    sort: query.sort,
  });
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.kind) params.set("kind", query.kind);
  if (query.sourceType) params.set("sourceType", query.sourceType);
  if (query.direction) params.set("direction", query.direction);

  const response = await apiRequest<LedgerEntryDto[]>(
    appendFinanceCompanyScope(`${FINANCE_PATH}/ledger?${params.toString()}`, scope),
  );
  return { data: response.data, meta: parsePageMeta(response.meta) };
}

/** `GET /finance/expenses/:id` (Backend permission: `finance.read`). */
export async function getManualExpense(id: string): Promise<ManualExpenseDetailDto> {
  const response = await apiRequest<ManualExpenseDetailDto>(
    `${FINANCE_PATH}/expenses/${id}`,
  );
  return response.data;
}

/** `POST /finance/expenses` (Backend permission: `finance.manage_expenses`). */
export async function createManualExpense(
  payload: CreateManualExpensePayload,
): Promise<ManualExpenseDetailDto> {
  const response = await apiRequest<ManualExpenseDetailDto>(`${FINANCE_PATH}/expenses`, {
    method: "POST",
    body: payload,
  });
  return response.data;
}

/** `POST /finance/expenses/:id/void` (Backend permission: `finance.manage_expenses`). */
export async function voidManualExpense(
  id: string,
  payload: VoidManualExpensePayload,
): Promise<ManualExpenseDetailDto> {
  const response = await apiRequest<ManualExpenseDetailDto>(
    `${FINANCE_PATH}/expenses/${id}/void`,
    { method: "POST", body: payload },
  );
  return response.data;
}

/** `POST /finance/expenses/:id/correct` (Backend permission: `finance.manage_expenses`). */
export async function correctManualExpense(
  id: string,
  payload: CorrectManualExpensePayload,
): Promise<ManualExpenseDetailDto> {
  const response = await apiRequest<ManualExpenseDetailDto>(
    `${FINANCE_PATH}/expenses/${id}/correct`,
    { method: "POST", body: payload },
  );
  return response.data;
}
