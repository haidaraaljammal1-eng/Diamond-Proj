"use client";

import { useCallback, useEffect, useState } from "react";
import { usePermissions } from "@/modules/auth";
import { normalizeApiError, type ApiRequestError } from "@/infrastructure/api/errors";
import { listReturnedContracts } from "../api/returned-contracts.api";
import { VIOLATIONS_CHARGE_PERMISSION, VIOLATIONS_READ_PERMISSION } from "../road-liabilities.permissions";
import type {
  ReturnedContractListItemDto,
  ReturnedContractsListQuery,
  RoadLiabilityPageMeta,
} from "../types/road-liabilities.types";
import { RETURNED_CONTRACTS_PAGE_SIZE } from "../types/road-liabilities.types";

export function useReturnedContracts() {
  const { hasPermission } = usePermissions();
  const isAllowed = hasPermission(VIOLATIONS_READ_PERMISSION);
  const canCharge = hasPermission(VIOLATIONS_CHARGE_PERMISSION);

  const [query, setQuery] = useState<ReturnedContractsListQuery>({
    page: 1,
    pageSize: RETURNED_CONTRACTS_PAGE_SIZE,
  });
  const [searchDraft, setSearchDraft] = useState("");
  const [items, setItems] = useState<ReturnedContractListItemDto[]>([]);
  const [meta, setMeta] = useState<RoadLiabilityPageMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);

  const load = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listReturnedContracts(query);
      setItems(result.items);
      setMeta(result.meta);
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }, [isAllowed, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = () => {
    setQuery((q) => ({ ...q, page: 1, search: searchDraft.trim() || undefined }));
  };

  const setCompanyFilter = (companyId?: number) => {
    setQuery((q) => ({ ...q, page: 1, companyId }));
  };

  const setPage = (page: number) => setQuery((q) => ({ ...q, page }));

  return {
    isAllowed,
    canCharge,
    items,
    meta,
    query,
    searchDraft,
    setSearchDraft,
    applySearch,
    setCompanyFilter,
    setPage,
    loading,
    error,
    refresh: load,
  };
}
