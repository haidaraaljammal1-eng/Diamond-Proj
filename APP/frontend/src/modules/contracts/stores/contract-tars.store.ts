"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getContractTarsState } from "../api/tars.api";
import type { ContractTarsStateDto } from "../types/tars.types";

export type ContractTarsLoadStatus = "idle" | "loading" | "ready" | "error";

/**
 * Deliberately separate from `contracts.store` — a failing TARS read must not
 * touch Contract detail state, and Contract mutations must not force an
 * integration refetch.
 */
interface ContractTarsState {
  contractId: string | null;
  state: ContractTarsStateDto | null;
  status: ContractTarsLoadStatus;
  error: ApiRequestError | null;
  /** Cached per contract: re-entry with the same id does not refetch. */
  load: (contractId: string) => Promise<void>;
  clear: () => void;
}

let inFlight: Promise<void> | null = null;

export const useContractTarsStore = create<ContractTarsState>((set, get) => ({
  contractId: null,
  state: null,
  status: "idle",
  error: null,
  load(contractId) {
    const current = get();
    if (current.contractId === contractId) {
      if (current.status === "loading") return inFlight ?? Promise.resolve();
      if (current.status === "ready" || current.status === "error")
        return Promise.resolve();
    }

    set({ contractId, state: null, status: "loading", error: null });
    inFlight = (async () => {
      try {
        const state = await getContractTarsState(contractId);
        if (get().contractId !== contractId) return;
        set({ state, status: "ready", error: null });
      } catch (error) {
        if (get().contractId !== contractId) return;
        set({ state: null, status: "error", error: normalizeApiError(error) });
      }
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  },
  clear() {
    set({ contractId: null, state: null, status: "idle", error: null });
  },
}));
