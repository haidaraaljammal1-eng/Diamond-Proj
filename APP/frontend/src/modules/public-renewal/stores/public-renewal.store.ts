"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getPublicPaymentStatus } from "@/modules/payments/api/payments.api";
import {
  confirmPublicRenewal,
  getPublicRenewal,
  startPublicRenewalPayment,
} from "../api/public-renewal.api";
import { isRenewalLinkGoneReason } from "../utils/resolve-public-renewal-error";
import type {
  ContractPaymentStatus,
  PublicRenewalLoadStatus,
  PublicRenewalView,
} from "../types/public-renewal.types";

/** In-memory public renewal state. Never persist the renewal token. */
interface PublicRenewalState {
  token: string | null;
  view: PublicRenewalView | null;
  status: PublicRenewalLoadStatus;
  confirmPending: boolean;
  payPending: boolean;
  statusPending: boolean;
  paymentStatus: ContractPaymentStatus | null;
  statusToken: string | null;
  error: ApiRequestError | null;
  load: (token: string) => Promise<void>;
  confirm: (token: string) => Promise<boolean>;
  startPayment: (token: string) => Promise<boolean>;
  refreshPaymentStatus: () => Promise<void>;
  reset: () => void;
}

const empty = {
  token: null as string | null,
  view: null as PublicRenewalView | null,
  status: "idle" as PublicRenewalLoadStatus,
  confirmPending: false,
  payPending: false,
  statusPending: false,
  paymentStatus: null as ContractPaymentStatus | null,
  statusToken: null as string | null,
  error: null as ApiRequestError | null,
};

export const usePublicRenewalStore = create<PublicRenewalState>((set, get) => ({
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

  async startPayment(token: string) {
    if (get().view?.payment?.providerAvailable !== true) return false;
    set({ payPending: true, error: null });
    try {
      const attempt = await startPublicRenewalPayment(token);
      const checkoutUrl = attempt.checkoutUrl ?? attempt.payment.checkoutUrl ?? null;
      set({
        payPending: false,
        statusToken: attempt.statusToken ?? get().statusToken,
        paymentStatus: attempt.payment.status,
      });
      if (checkoutUrl && typeof window !== "undefined") {
        window.location.assign(checkoutUrl);
        return true;
      }
      await get().load(token);
      return true;
    } catch (error) {
      set({ payPending: false, error: normalizeApiError(error) });
      return false;
    }
  },

  async refreshPaymentStatus() {
    const statusToken = get().statusToken;
    const token = get().token;
    if (!statusToken || !token) return;
    set({ statusPending: true });
    try {
      const paymentStatus = await getPublicPaymentStatus(statusToken);
      set({ paymentStatus: paymentStatus.status, statusPending: false });
      await get().load(token);
    } catch (error) {
      set({ statusPending: false, error: normalizeApiError(error) });
    }
  },

  reset() {
    set({ ...empty });
  },
}));
