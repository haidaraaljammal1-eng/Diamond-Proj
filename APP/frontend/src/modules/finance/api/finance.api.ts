import { apiRequest } from "@/infrastructure/api/client";
import { ApiRequestError } from "@/infrastructure/api/errors";
import type { ApiErrorResponse } from "@/infrastructure/api/types";
import { env } from "@/config/env";

async function getAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getSession } = await import("next-auth/react");
  return (await getSession())?.accessToken;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as ApiErrorResponse).error;
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}
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
  type FinanceStatementExportParams,
  type StatementCompanyCode,
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

/** `POST /finance/open-receivables/road-liabilities/:roadLiabilityId/cash-confirm`. */
export async function confirmOpenReceivableRoadLiabilityCash(
  roadLiabilityId: string,
  idempotencyKey: string,
): Promise<{ received: true }> {
  const response = await apiRequest<{ received: true }>(
    `${FINANCE_PATH}/open-receivables/road-liabilities/${roadLiabilityId}/cash-confirm`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
  return response.data;
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

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) return decodeURIComponent(utf[1]);
  const ascii = header.match(/filename="([^"]+)"/i);
  return ascii?.[1] ?? null;
}

function buildStatementQuery(params: FinanceStatementExportParams): string {
  const q = new URLSearchParams();
  q.set("periodType", params.periodType);
  if (params.date) q.set("date", params.date);
  if (params.weekStart) q.set("weekStart", params.weekStart);
  if (params.year != null) q.set("year", String(params.year));
  if (params.month != null) q.set("month", String(params.month));
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.locale) q.set("locale", params.locale);
  return q.toString();
}

export interface FinanceStatementBusinessTodayDto {
  businessDate: string;
  displayAr: string;
  displayEn: string;
}

/** `GET /finance/statements/business-today` (Backend permission: `finance.read`). */
export async function fetchFinanceStatementBusinessToday(): Promise<FinanceStatementBusinessTodayDto> {
  const response = await apiRequest<FinanceStatementBusinessTodayDto>(
    `${FINANCE_PATH}/statements/business-today`,
  );
  return response.data;
}

/** `GET /finance/statements/:companyCode/pdf` (Backend permission: `finance.read`). */
export async function downloadFinanceStatementPdf(
  companyCode: StatementCompanyCode,
  params: FinanceStatementExportParams,
): Promise<{ blob: Blob; filename: string }> {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${env.apiUrl}${FINANCE_PATH}/statements/${companyCode}/pdf?${buildStatementQuery(params)}`,
    {
      method: "GET",
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: "include",
    },
  );
  if (!response.ok) {
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = undefined;
    }
    if (isApiErrorResponse(payload)) {
      throw new ApiRequestError(payload.error, response.status);
    }
    throw new ApiRequestError(
      { code: `HTTP_${response.status}`, message: response.statusText || "Statement export failed" },
      response.status,
    );
  }
  const blob = await response.blob();
  const filename =
    parseContentDispositionFilename(response.headers.get("content-disposition")) ??
    `Diamond-${companyCode}-Statement.pdf`;
  return { blob, filename };
}
