"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getPublicReturn } from "../api/public-return.api";
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
  load: (token: string) => Promise<void>;
  reset: () => void;
}

const empty = {
  token: null as string | null,
  view: null as PublicReturnView | null,
  status: "idle" as PublicReturnLoadStatus,
  error: null as ApiRequestError | null,
};

export const usePublicReturnStore = create<PublicReturnState>((set) => ({
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

  reset() {
    set({ ...empty });
  },
}));
