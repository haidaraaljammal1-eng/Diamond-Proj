"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  acceptPublicRental,
  getPublicPaymentStatus,
  getPublicRental,
  startPublicRentalPayment,
  submitPublicRentalForm,
  uploadPublicRentalLicense,
} from "../api/public-rental.api";
import type {
  PublicPaymentStatus,
  PublicRentalContext,
  PublicRentalFormPayload,
  PublicRentalUiStage,
} from "../types/public-rental.types";
import { isLinkGoneReason, uiStageFromFlowStep } from "../utils/flow-step";
import { publicRentalErrorReason } from "../utils/resolve-public-rental-error";

/** In-memory public rental state. Never persist the rental or status token. */
export type PublicRentalLoadStatus = "idle" | "loading" | "ready" | "error";

interface PublicRentalState {
  token: string | null;
  context: PublicRentalContext | null;
  status: PublicRentalLoadStatus;
  error: ApiRequestError | null;
  uploadPending: boolean;
  formPending: boolean;
  acceptPending: boolean;
  payPending: boolean;
  statusPending: boolean;
  paymentStatus: PublicPaymentStatus | null;
  /** True when the rental link expired but a payment attempt can still be queried. */
  linkExpiredDuringPayment: boolean;
  /** Returned once for a real card attempt. Memory only — never persisted. */
  statusToken: string | null;
  load: (token: string) => Promise<void>;
  uploadLicense: (file: File) => Promise<boolean>;
  submitForm: (payload: PublicRentalFormPayload) => Promise<boolean>;
  accept: () => Promise<boolean>;
  startPayment: () => Promise<boolean>;
  refreshPaymentStatus: () => Promise<void>;
  reset: () => void;
}

const empty = {
  token: null as string | null,
  context: null as PublicRentalContext | null,
  status: "idle" as PublicRentalLoadStatus,
  error: null as ApiRequestError | null,
  uploadPending: false,
  formPending: false,
  acceptPending: false,
  payPending: false,
  statusPending: false,
  paymentStatus: null as PublicPaymentStatus | null,
  linkExpiredDuringPayment: false,
  statusToken: null as string | null,
};

export const usePublicRentalStore = create<PublicRentalState>((set, get) => ({
  ...empty,

  async load(token: string) {
    set({ token, status: "loading", error: null });
    try {
      const context = await getPublicRental(token);
      set({
        context,
        status: "ready",
        error: null,
        paymentStatus: null,
        linkExpiredDuringPayment: false,
      });
    } catch (error) {
      const normalized = normalizeApiError(error);
      const reason = publicRentalErrorReason(normalized);
      const { statusToken } = get();
      if (isLinkGoneReason(reason) && statusToken) {
        try {
          const paymentStatus = await getPublicPaymentStatus(statusToken);
          set({
            status: "ready",
            error: null,
            paymentStatus,
            linkExpiredDuringPayment: true,
          });
          return;
        } catch {
          /* fall through to link error */
        }
      }
      set({ status: "error", error: normalized, context: null });
    }
  },

  async uploadLicense(file: File) {
    const token = get().token;
    if (!token) return false;
    set({ uploadPending: true, error: null });
    try {
      const context = await uploadPublicRentalLicense(token, file);
      set({ context, uploadPending: false, status: "ready", error: null });
      return true;
    } catch (error) {
      set({ uploadPending: false, error: normalizeApiError(error) });
      return false;
    }
  },

  async submitForm(payload: PublicRentalFormPayload) {
    const token = get().token;
    if (!token) return false;
    set({ formPending: true, error: null });
    try {
      const context = await submitPublicRentalForm(token, payload);
      set({ context, formPending: false, status: "ready", error: null });
      return true;
    } catch (error) {
      set({ formPending: false, error: normalizeApiError(error) });
      return false;
    }
  },

  async accept() {
    const token = get().token;
    const termsVersion = get().context?.contract.termsVersion;
    if (!token) return false;
    set({ acceptPending: true, error: null });
    try {
      const context = await acceptPublicRental(token, termsVersion);
      set({ context, acceptPending: false, status: "ready", error: null });
      return true;
    } catch (error) {
      set({ acceptPending: false, error: normalizeApiError(error) });
      return false;
    }
  },

  async startPayment() {
    const token = get().token;
    if (!token) return false;
    if (get().context?.payment.providerAvailable !== true) return false;
    set({ payPending: true, error: null });
    try {
      const attempt = await startPublicRentalPayment(token, crypto.randomUUID());
      set({
        payPending: false,
        statusToken: attempt.statusToken ?? get().statusToken,
      });
      await get().load(token);
      return true;
    } catch (error) {
      set({ payPending: false, error: normalizeApiError(error) });
      return false;
    }
  },

  async refreshPaymentStatus() {
    const statusToken = get().statusToken;
    if (!statusToken) return;
    set({ statusPending: true });
    try {
      const paymentStatus = await getPublicPaymentStatus(statusToken);
      set({ paymentStatus, statusPending: false });
      const token = get().token;
      if (token) await get().load(token);
    } catch (error) {
      set({ statusPending: false, error: normalizeApiError(error) });
    }
  },

  reset() {
    set({ ...empty });
  },
}));

export function allowedUiStage(
  context: PublicRentalContext | null,
): PublicRentalUiStage {
  if (!context) return "license";
  return uiStageFromFlowStep(context.flow.step);
}
