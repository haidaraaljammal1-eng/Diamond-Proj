"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  acceptPublicRental,
  getPublicPaymentStatus,
  getPublicRental,
  simulatePublicRentalLicense,
  simulatePublicRentalPassport,
  simulatePublicRentalPayment,
  startPublicRentalPayment,
  submitPublicRentalForm,
  uploadPublicRentalLicense,
  uploadPublicRentalPassport,
  requestPublicTarsOtp,
  verifyPublicTarsOtp,
} from "../api/public-rental.api";
import type {
  DocumentCapturePhase,
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
  /** Passport capture request lifecycle; backend status stays in `context.identity`. */
  passportPhase: DocumentCapturePhase;
  passportError: ApiRequestError | null;
  formPending: boolean;
  acceptPending: boolean;
  payPending: boolean;
  statusPending: boolean;
  paymentStatus: PublicPaymentStatus | null;
  simulationPending: boolean;
  tarsOtpRequestPending: boolean;
  tarsOtpVerifyPending: boolean;
  tarsOtpError: ApiRequestError | null;
  /** True when the rental link expired but a payment attempt can still be queried. */
  linkExpiredDuringPayment: boolean;
  /** Returned once for a real card attempt. Memory only — never persisted. */
  statusToken: string | null;
  load: (token: string) => Promise<void>;
  uploadLicense: (file: File) => Promise<boolean>;
  uploadPassport: (file: File) => Promise<boolean>;
  submitForm: (payload: PublicRentalFormPayload) => Promise<boolean>;
  accept: () => Promise<boolean>;
  startPayment: (savePaymentMethodForFutureUse?: boolean) => Promise<boolean>;
  simulateLicense: () => Promise<boolean>;
  simulatePassport: () => Promise<boolean>;
  simulatePayment: () => Promise<boolean>;
  refreshPaymentStatus: () => Promise<void>;
  requestTarsOtp: () => Promise<boolean>;
  verifyTarsOtp: (code: string) => Promise<boolean>;
  reset: () => void;
}

const empty = {
  token: null as string | null,
  context: null as PublicRentalContext | null,
  status: "idle" as PublicRentalLoadStatus,
  error: null as ApiRequestError | null,
  uploadPending: false,
  passportPhase: "idle" as DocumentCapturePhase,
  passportError: null as ApiRequestError | null,
  formPending: false,
  acceptPending: false,
  payPending: false,
  statusPending: false,
  paymentStatus: null as PublicPaymentStatus | null,
  simulationPending: false,
  tarsOtpRequestPending: false,
  tarsOtpVerifyPending: false,
  tarsOtpError: null as ApiRequestError | null,
  linkExpiredDuringPayment: false,
  statusToken: null as string | null,
};

let passportAttempt = 0;

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

  async uploadPassport(file: File) {
    const token = get().token;
    if (!token) return false;
    // Latest capture wins: a slower earlier response must not overwrite a retake.
    const attempt = ++passportAttempt;
    set({ passportPhase: "uploading", passportError: null, error: null });
    try {
      const context = await uploadPublicRentalPassport(token, file, () => {
        if (attempt === passportAttempt) set({ passportPhase: "processing" });
      });
      if (attempt !== passportAttempt) return false;
      set({ context, passportPhase: "idle", status: "ready" });
      return true;
    } catch (error) {
      if (attempt !== passportAttempt) return false;
      set({ passportPhase: "idle", passportError: normalizeApiError(error) });
      return false;
    }
  },

  async simulateLicense() {
    const token = get().token;
    if (!token || get().simulationPending) return false;
    set({ simulationPending: true, error: null });
    try {
      await simulatePublicRentalLicense(token);
      const context = await getPublicRental(token);
      set({ context, simulationPending: false, status: "ready", error: null });
      return true;
    } catch (error) {
      set({ simulationPending: false, error: normalizeApiError(error) });
      return false;
    }
  },

  async simulatePassport() {
    const token = get().token;
    if (!token || get().simulationPending) return false;
    set({ simulationPending: true, passportError: null, error: null });
    try {
      await simulatePublicRentalPassport(token);
      const context = await getPublicRental(token);
      set({ context, simulationPending: false, passportPhase: "idle", status: "ready", error: null });
      return true;
    } catch (error) {
      set({ simulationPending: false, passportError: normalizeApiError(error) });
      return false;
    }
  },

  async simulatePayment() {
    const token = get().token;
    if (!token || get().simulationPending) return false;
    set({ simulationPending: true, error: null });
    try {
      await simulatePublicRentalPayment(token, crypto.randomUUID());
      const context = await getPublicRental(token);
      set({ context, simulationPending: false, status: "ready", error: null });
      return true;
    } catch (error) {
      set({ simulationPending: false, error: normalizeApiError(error) });
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

  async startPayment(savePaymentMethodForFutureUse = false) {
    const token = get().token;
    if (!token) return false;
    if (get().context?.payment.providerAvailable !== true) return false;
    set({ payPending: true, error: null });
    try {
      const attempt = await startPublicRentalPayment(token, crypto.randomUUID(), {
        savePaymentMethodForFutureUse,
      });
      const checkoutUrl = attempt.checkoutUrl ?? null;
      set({
        payPending: false,
        statusToken: attempt.statusToken ?? get().statusToken,
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
    if (!statusToken) {
      const token = get().token;
      if (token) await get().load(token);
      return;
    }
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

  async requestTarsOtp() {
    const token = get().token;
    if (!token) return false;
    set({ tarsOtpRequestPending: true, tarsOtpError: null });
    try {
      const tarsOtp = await requestPublicTarsOtp(token);
      const context = get().context;
      set({
        tarsOtpRequestPending: false,
        context: context ? { ...context, tarsOtp } : context,
      });
      return true;
    } catch (error) {
      set({ tarsOtpRequestPending: false, tarsOtpError: normalizeApiError(error) });
      return false;
    }
  },

  async verifyTarsOtp(code: string) {
    const token = get().token;
    if (!token) return false;
    set({ tarsOtpVerifyPending: true, tarsOtpError: null });
    try {
      const tarsOtp = await verifyPublicTarsOtp(token, code);
      const context = get().context;
      set({
        tarsOtpVerifyPending: false,
        context: context ? { ...context, tarsOtp } : context,
      });
      return tarsOtp.status === "VERIFIED";
    } catch (error) {
      set({ tarsOtpVerifyPending: false, tarsOtpError: normalizeApiError(error) });
      return false;
    }
  },

  reset() {
    passportAttempt += 1;
    set({ ...empty });
  },
}));

export function allowedUiStage(
  context: PublicRentalContext | null,
): PublicRentalUiStage {
  if (!context) return "license";
  return uiStageFromFlowStep(context.flow.step);
}
