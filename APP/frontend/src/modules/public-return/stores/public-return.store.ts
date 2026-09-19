"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { confirmPublicReturn, getPublicReturn } from "../api/public-return.api";
import type {
  PublicReturnLoadStatus,
  PublicReturnView,
} from "../types/public-return.types";

/** In-memory public return state. Never persist the return token. */
interface PublicReturnState {
  token: string | null;
  view: PublicReturnView | null;
  status: PublicReturnLoadStatus;
  error: ApiRequestError | null;
  confirming: boolean;
  confirmError: ApiRequestError | null;
  load: (token: string) => Promise<void>;
  confirm: () => Promise<void>;
  reset: () => void;
}

const empty = {
  token: null as string | null,
  view: null as PublicReturnView | null,
  status: "idle" as PublicReturnLoadStatus,
  error: null as ApiRequestError | null,
  confirming: false,
  confirmError: null as ApiRequestError | null,
};

export const usePublicReturnStore = create<PublicReturnState>((set, get) => ({
  ...empty,

  async load(token: string) {
    set({ token, status: "loading", error: null });
    try {
      const view = await getPublicReturn(token);
      set({ view, status: "ready", error: null });
    } catch (error) {
      set({
        view: null,
        status: "error",
        error: normalizeApiError(error),
      });
    }
  },

  async confirm() {
    const { token, confirming } = get();
    if (!token || confirming) return;
    set({ confirming: true, confirmError: null });
    try {
      // The Backend view is authoritative; never flip status locally.
      const view = await confirmPublicReturn(token);
      set({ view, confirming: false });
    } catch (error) {
      set({ confirming: false, confirmError: normalizeApiError(error) });
    }
  },

  reset() {
    set({ ...empty });
  },
}));
