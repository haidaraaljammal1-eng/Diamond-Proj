"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  INVOICES_PAGE_PERMISSIONS,
  INVOICES_SEND_WHATSAPP_PERMISSION,
} from "../invoices.permissions";
import { useInvoicesStore } from "../stores/invoices.store";
import type {
  InvoiceDeliveryDto,
  InvoiceDetailDto,
  InvoiceListItemDto,
  InvoicePageMeta,
  InvoicesListQuery,
} from "../types/invoices.types";
import { countInvoiceActiveFilters } from "../utils/invoice-filters";

export interface UseInvoicesResult {
  items: InvoiceListItemDto[];
  pagination: InvoicePageMeta | null;
  query: InvoicesListQuery;
  searchDraft: string;
  appliedSearch: string;
  activeFilterCount: number;
  selectedInvoiceId: string | null;
  selectedDetail: InvoiceDetailDto | null;
  deliveries: InvoiceDeliveryDto[];
  detailOpen: boolean;
  isAllowed: boolean;
  canSendWhatsApp: boolean;
  isListLoading: boolean;
  isDetailLoading: boolean;
  isDeliveriesLoading: boolean;
  isRefreshing: boolean;
  listError: ApiRequestError | null;
  detailError: ApiRequestError | null;
  deliveriesError: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  applySearch: (search: string) => void;
  clearSearch: () => void;
  setSearchDraft: (value: string) => void;
  setCompanyCode: (code: InvoicesListQuery["companyCode"]) => void;
  setInvoiceType: (type: InvoicesListQuery["invoiceType"]) => void;
  setDateRange: (from: string, to: string) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  selectInvoice: (id: string) => void;
  closeDetail: () => void;
  reloadDetailAndDeliveries: () => Promise<void>;
  patchListItemDeliveryStatus: (id: string, status: string | null) => void;
}

export function useInvoices(): UseInvoicesResult {
  const { hasPermission } = usePermissions();
  const isAllowed = INVOICES_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );
  const canSendWhatsApp = hasPermission(INVOICES_SEND_WHATSAPP_PERMISSION);

  const items = useInvoicesStore((s) => s.items);
  const pagination = useInvoicesStore((s) => s.pagination);
  const query = useInvoicesStore((s) => s.query);
  const searchDraft = useInvoicesStore((s) => s.searchDraft);
  const appliedSearch = useInvoicesStore((s) => s.appliedSearch);
  const companyCode = useInvoicesStore((s) => s.companyCode);
  const invoiceType = useInvoicesStore((s) => s.invoiceType);
  const dateRange = useInvoicesStore((s) => s.dateRange);
  const selectedInvoiceId = useInvoicesStore((s) => s.selectedInvoiceId);
  const selectedDetail = useInvoicesStore((s) => s.selectedDetail);
  const deliveries = useInvoicesStore((s) => s.deliveries);
  const detailOpen = useInvoicesStore((s) => s.detailOpen);
  const listLoading = useInvoicesStore((s) => s.listLoading);
  const detailLoading = useInvoicesStore((s) => s.detailLoading);
  const deliveriesLoading = useInvoicesStore((s) => s.deliveriesLoading);
  const listStatus = useInvoicesStore((s) => s.listStatus);
  const listError = useInvoicesStore((s) => s.listError);
  const detailError = useInvoicesStore((s) => s.detailError);
  const deliveriesError = useInvoicesStore((s) => s.deliveriesError);
  const load = useInvoicesStore((s) => s.load);
  const refresh = useInvoicesStore((s) => s.refresh);
  const applySearch = useInvoicesStore((s) => s.applySearch);
  const clearSearch = useInvoicesStore((s) => s.clearSearch);
  const setSearchDraft = useInvoicesStore((s) => s.setSearchDraft);
  const setCompanyCode = useInvoicesStore((s) => s.setCompanyCode);
  const setInvoiceType = useInvoicesStore((s) => s.setInvoiceType);
  const setDateRange = useInvoicesStore((s) => s.setDateRange);
  const resetFilters = useInvoicesStore((s) => s.resetFilters);
  const setPage = useInvoicesStore((s) => s.setPage);
  const selectInvoice = useInvoicesStore((s) => s.selectInvoice);
  const closeDetail = useInvoicesStore((s) => s.closeDetail);
  const reloadDetailAndDeliveries = useInvoicesStore((s) => s.reloadDetailAndDeliveries);
  const patchListItemDeliveryStatus = useInvoicesStore((s) => s.patchListItemDeliveryStatus);

  const mergedQuery = useMemo<InvoicesListQuery>(
    () => ({
      search: appliedSearch,
      companyCode,
      invoiceType,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      page: query.page,
      pageSize: query.pageSize,
    }),
    [appliedSearch, companyCode, invoiceType, dateRange, query.page, query.pageSize],
  );

  const activeFilterCount = useMemo(
    () => countInvoiceActiveFilters(mergedQuery),
    [mergedQuery],
  );

  useEffect(() => {
    if (!isAllowed) return;
    if (listStatus === "idle") void load();
  }, [isAllowed, listStatus, load]);

  const isListLoading = listLoading;
  const isRefreshing = listLoading && listStatus === "ready";

  return {
    items,
    pagination,
    query: mergedQuery,
    searchDraft,
    appliedSearch,
    activeFilterCount,
    selectedInvoiceId,
    selectedDetail,
    deliveries,
    detailOpen,
    isAllowed,
    canSendWhatsApp,
    isListLoading,
    isDetailLoading: detailLoading,
    isDeliveriesLoading: deliveriesLoading,
    isRefreshing,
    listError,
    detailError,
    deliveriesError,
    load,
    refresh,
    applySearch,
    clearSearch,
    setSearchDraft,
    setCompanyCode,
    setInvoiceType,
    setDateRange,
    clearFilters: resetFilters,
    setPage,
    selectInvoice,
    closeDetail,
    reloadDetailAndDeliveries,
    patchListItemDeliveryStatus,
  };
}
