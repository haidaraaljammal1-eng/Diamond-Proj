import type { InvoicesListQuery } from "../types/invoices.types.ts";
import { INVOICES_PAGE_SIZE } from "../types/invoices.types.ts";

export const DEFAULT_INVOICES_QUERY: InvoicesListQuery = {
  search: "",
  companyCode: "ALL",
  invoiceType: "ALL",
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: INVOICES_PAGE_SIZE,
};

/** Date input `YYYY-MM-DD` → Backend ISO instant (UTC day boundary). */
export function dateInputToIso(value: string, endOfDay = false): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return endOfDay ? `${trimmed}T23:59:59.000Z` : `${trimmed}T00:00:00.000Z`;
}

export function buildInvoicesQuery(params: InvoicesListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page || 1));
  search.set("pageSize", String(params.pageSize || INVOICES_PAGE_SIZE));

  const term = params.search?.trim();
  if (term) search.set("search", term);

  if (params.companyCode && params.companyCode !== "ALL") {
    search.set("companyCode", params.companyCode);
  }
  if (params.invoiceType && params.invoiceType !== "ALL") {
    search.set("invoiceType", params.invoiceType);
  }

  const fromIso = dateInputToIso(params.dateFrom, false);
  if (fromIso) search.set("dateFrom", fromIso);
  const toIso = dateInputToIso(params.dateTo, true);
  if (toIso) search.set("dateTo", toIso);

  return search.toString();
}

export function countInvoiceActiveFilters(query: InvoicesListQuery): number {
  let count = 0;
  if (query.search.trim()) count += 1;
  if (query.companyCode !== "ALL") count += 1;
  if (query.invoiceType !== "ALL") count += 1;
  if (query.dateFrom.trim()) count += 1;
  if (query.dateTo.trim()) count += 1;
  return count;
}

export function hasInvoiceListFilters(query: InvoicesListQuery): boolean {
  return countInvoiceActiveFilters(query) > 0;
}
