"use client";

import { create } from "zustand";
import { normalizeApiError, type ApiRequestError } from "@/infrastructure/api/errors";
import { refreshAfterPending } from "@/infrastructure/state/refresh-after-pending";
import { getOperatingCompanies } from "../api/operating-companies.api";
import type { OperatingCompanyDto } from "../types/operating-company.types";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface OperatingCompaniesState {
  companies: OperatingCompanyDto[];
  status: LoadStatus;
  error: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useOperatingCompaniesStore = create<OperatingCompaniesState>((set, get) => {
  async function fetchCompanies() {
    set({ status: "loading", error: null });
    try {
      const companies = await getOperatingCompanies();
      set({
        companies: companies.filter((company) => company.isActive),
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: normalizeApiError(error) });
    }
  }

  function run() {
    if (inFlight) return inFlight;
    inFlight = fetchCompanies().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    companies: [],
    status: "idle",
    error: null,
    load() {
      const status = get().status;
      if (status === "ready" || status === "loading") return inFlight ?? Promise.resolve();
      return run();
    },
    refresh() {
      return refreshAfterPending(() => inFlight, run);
    },
  };
});
