"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useContractsStore } from "../stores/contracts.store";
import type { PageMeta } from "../api/contracts.api.types";
import type {
  ContractFiltersState,
  ContractListItemDto,
  ContractSortKey,
  ContractStatusFilter,
} from "../types/contract.types";
import { countActiveContractFilters } from "../utils/contract-filters";
import {
  CONTRACTS_MANAGE_PERMISSION,
  CONTRACTS_PAGE_PERMISSIONS,
} from "../contracts.permissions";

export interface UseContractsResult {
  contracts: ContractListItemDto[];
  meta: PageMeta | null;
  filters: ContractFiltersState;
  activeFilterCount: number;
  isAllowed: boolean;
  isLoading: boolean;
  isReady: boolean;
  error: ApiRequestError | null;
  canManage: boolean;
  loadContracts: () => Promise<void>;
  refreshContracts: () => Promise<void>;
  setStatusFilter: (status: ContractStatusFilter) => void;
  applySearch: (search: string) => void;
  clearSearch: () => void;
  setDateRange: (from: string, to: string) => void;
  setSort: (sort: ContractSortKey) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
}

export function useContracts(): UseContractsResult {
  const { hasPermission } = usePermissions();
  const contracts = useContractsStore((state) => state.contracts);
  const meta = useContractsStore((state) => state.meta);
  const query = useContractsStore((state) => state.query);
  const status = useContractsStore((state) => state.status);
  const error = useContractsStore((state) => state.error);
  const load = useContractsStore((state) => state.load);
  const refresh = useContractsStore((state) => state.refresh);
  const setQuery = useContractsStore((state) => state.setQuery);
  const resetFilters = useContractsStore((state) => state.resetFilters);

  const isAllowed = CONTRACTS_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );
  const canManage = hasPermission(CONTRACTS_MANAGE_PERMISSION);

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const filters = useMemo<ContractFiltersState>(
    () => ({
      status: query.status,
      search: query.search,
      from: query.from,
      to: query.to,
      sort: query.sort,
    }),
    [query.status, query.search, query.from, query.to, query.sort],
  );

  return useMemo(
    () => ({
      contracts,
      meta,
      filters,
      activeFilterCount: countActiveContractFilters(filters),
      isAllowed,
      isLoading: status === "loading" || (isAllowed && status === "idle"),
      isReady: status === "ready",
      error: status === "error" ? error : null,
      canManage,
      loadContracts: load,
      refreshContracts: refresh,
      setStatusFilter: (statusFilter: ContractStatusFilter) => {
        void setQuery({ status: statusFilter, page: 1 });
      },
      applySearch: (search: string) => {
        void setQuery({ search: search.trim(), page: 1 });
      },
      clearSearch: () => {
        void setQuery({ search: "", page: 1 });
      },
      setDateRange: (from: string, to: string) => {
        void setQuery({ from, to, page: 1 });
      },
      setSort: (sort: ContractSortKey) => {
        void setQuery({ sort, page: 1 });
      },
      clearFilters: resetFilters,
      setPage: (page: number) => {
        void setQuery({ page });
      },
    }),
    [
      contracts,
      meta,
      filters,
      isAllowed,
      status,
      error,
      canManage,
      load,
      refresh,
      setQuery,
      resetFilters,
    ],
  );
}
