import type {
  ContractFiltersState,
  ContractSortKey,
  ContractsListQuery,
} from "../types/contract.types";

export const DEFAULT_CONTRACT_FILTERS: ContractFiltersState = {
  status: "all",
  search: "",
  from: "",
  to: "",
  sort: "newest",
};

export const CONTRACT_SORT_PARAM: Record<ContractSortKey, string> = {
  newest: "createdAt:desc",
  oldest: "createdAt:asc",
  amountDesc: "agreedAmount:desc",
  amountAsc: "agreedAmount:asc",
  startAt: "startAt:desc",
  number: "contractNumber:asc",
};

export const CONTRACT_SORT_KEYS = Object.keys(
  CONTRACT_SORT_PARAM,
) as ContractSortKey[];

/**
 * Builds `GET /contracts` query string. Only Backend-supported params.
 * Applied search is the only search that is sent — never a draft.
 */
export function buildContractsQuery(params: ContractsListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("pageSize", String(params.pageSize ?? 20));

  if (params.status && params.status !== "all") {
    search.set("status", params.status);
  }

  const term = params.search?.trim();
  if (term) search.set("search", term);

  if (params.from?.trim()) search.set("from", dateInputToIso(params.from.trim()));
  if (params.to?.trim()) search.set("to", dateInputToIso(params.to.trim(), true));

  if (params.vehicleId) search.set("vehicleId", String(params.vehicleId));
  if (params.customerId) search.set("customerId", String(params.customerId));

  if (params.sort && params.sort !== "newest") {
    search.set("sort", CONTRACT_SORT_PARAM[params.sort]);
  }

  return search.toString();
}

export function countActiveContractFilters(filters: ContractFiltersState): number {
  let count = 0;
  if (filters.status !== DEFAULT_CONTRACT_FILTERS.status) count += 1;
  if (filters.search.trim()) count += 1;
  if (filters.from.trim() || filters.to.trim()) count += 1;
  if (filters.sort !== DEFAULT_CONTRACT_FILTERS.sort) count += 1;
  return count;
}

/** Date input `YYYY-MM-DD` → Backend ISO instant. */
export function dateInputToIso(value: string, endOfDay = false): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return endOfDay ? `${trimmed}T23:59:59.000Z` : `${trimmed}T00:00:00.000Z`;
}
