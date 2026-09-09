"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { confirmPublicRenewal, getPublicRenewal } from "../api/public-renewal.api";
import { isRenewalLinkGoneReason } from "../utils/resolve-public-renewal-error";
import type {
  PublicRenewalLoadStatus,
  PublicRenewalView,
} from "../types/public-renewal.types";

/** In-memory public renewal state. Never persist the renewal token. */
interface PublicRenewalState {
  token: string | null;
  view: PublicRenewalView | null;
  status: PublicRenewalLoadStatus;
  confirmPending: boolean;
  error: ApiRequestError | null;
  load: (token: string) => Promise<void>;
  confirm: (token: string) => Promise<boolean>;
  reset: () => void;
}

const empty = {
  token: null as string | null,
  view: null as PublicRenewalView | null,
  status: "idle" as PublicRenewalLoadStatus,
  confirmPending: false,
  error: null as ApiRequestError | null,
};

export const usePublicRenewalStore = create<PublicRenewalState>((set) => ({
  ...empty,

  async load(token: string) {
    set({ token, status: "loading", error: null });
    try {
      const view = await getPublicRenewal(token);
      set({ view, status: "ready", error: null });
    } catch (error) {
      set({
        view: null,
        status: "error",
        error: normalizeApiError(error),
      });
    }
  },

  async confirm(token: string) {
    set({ confirmPending: true, error: null });
    try {
      const view = await confirmPublicRenewal(token);
      set({ view, status: "ready", confirmPending: false, error: null });
      return true;
    } catch (error) {
      const normalized = normalizeApiError(error);
      const reason =
        typeof normalized.context?.reason === "string" ? normalized.context.reason : null;
      if (isRenewalLinkGoneReason(reason)) {
        set({
          view: null,
          status: "error",
          confirmPending: false,
          error: normalized,
        });
      } else {
        set({ confirmPending: false, error: normalized });
      }
      return false;
    }
  },

  reset() {
    set({ ...empty });
  },
}));
