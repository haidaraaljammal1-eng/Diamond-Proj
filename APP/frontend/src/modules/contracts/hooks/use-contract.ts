"use client";

import { useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import { useLocale } from "next-intl";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useContractsStore } from "../stores/contracts.store";
import type {
  CarInPayload,
  CarOutPayload,
  ConfirmContractPaymentPayload,
  ContractDetailDto,
  CreateContractOfferPayload,
  InspectionAngle,
  IssuedContractLinkView,
  ReconcilePayload,
  RenewPayload,
} from "../types/contract.types";
import { getContractActions } from "../utils/contract-actions";
import type { ContractPermissionFlags, ContractUiActions } from "../utils/contract-actions";
import {
  CONTRACTS_ACTIVATE_PERMISSION,
  CONTRACTS_CAR_OUT_PERMISSION,
  CONTRACTS_CLOSE_PERMISSION,
  CONTRACTS_MANAGE_PERMISSION,
  CONTRACTS_RECONCILE_PERMISSION,
  CONTRACTS_RENEW_PERMISSION,
  CONTRACTS_RETURN_PERMISSION,
} from "../contracts.permissions";

export interface UseContractResult {
  detail: ContractDetailDto | null;
  detailStatus: "idle" | "loading" | "ready" | "error";
  detailError: ApiRequestError | null;
  issuedLink: IssuedContractLinkView | null;
  actions: ContractUiActions | null;
  permissions: ContractPermissionFlags;
  offerPending: boolean;
  offerError: ApiRequestError | null;
  rentalLinkPending: boolean;
  paymentPending: boolean;
  paymentError: ApiRequestError | null;
  carOutPending: boolean;
  carOutError: ApiRequestError | null;
  carInPending: boolean;
  carInError: ApiRequestError | null;
  returnLinkPending: boolean;
  returnLinkError: ApiRequestError | null;
  renewPending: boolean;
  renewError: ApiRequestError | null;
  reconcilePending: boolean;
  reconcileError: ApiRequestError | null;
  closePending: boolean;
  closeError: ApiRequestError | null;
  locale: string;
  loadContract: (id: string) => Promise<void>;
  clearContract: () => void;
  clearIssuedLink: () => void;
  createOffer: (
    payload: CreateContractOfferPayload,
    generateLink?: boolean,
  ) => Promise<ContractDetailDto | null>;
  generateRentalLink: (id: string) => Promise<boolean>;
  confirmPayment: (
    id: string,
    payload: ConfirmContractPaymentPayload,
    idempotencyKey: string,
  ) => Promise<boolean>;
  submitCarOut: (
    id: string,
    payload: Omit<CarOutPayload, "photos" | "hirerSignatureAttachmentId"> & {
      photos: { angle: InspectionAngle; file: File }[];
      hirerSignature?: Blob | null;
    },
    idempotencyKey: string,
  ) => Promise<boolean>;
  submitCarIn: (
    id: string,
    payload: Omit<CarInPayload, "photos" | "hirerSignatureAttachmentId"> & {
      photos: { angle: InspectionAngle; file: File }[];
      hirerSignature?: Blob | null;
    },
    idempotencyKey: string,
  ) => Promise<boolean>;
  generateReturnLink: (id: string) => Promise<boolean>;
  generateRenewalLink: (id: string, payload: RenewPayload) => Promise<boolean>;
  renew: (id: string, payload: RenewPayload, idempotencyKey: string) => Promise<boolean>;
  reconcile: (id: string, payload: ReconcilePayload) => Promise<boolean>;
  close: (id: string, idempotencyKey: string) => Promise<boolean>;
  clearOfferError: () => void;
  clearPaymentError: () => void;
  clearCarOutError: () => void;
  clearCarInError: () => void;
  clearRenewError: () => void;
  clearReconcileError: () => void;
  clearCloseError: () => void;
}

export function useContract(): UseContractResult {
  const { hasPermission } = usePermissions();
  const locale = useLocale();
  const store = useContractsStore();

  const permissions = useMemo<ContractPermissionFlags>(
    () => ({
      canManage: hasPermission(CONTRACTS_MANAGE_PERMISSION),
      canActivate: hasPermission(CONTRACTS_ACTIVATE_PERMISSION),
      canCarOut: hasPermission(CONTRACTS_CAR_OUT_PERMISSION),
      canReturn: hasPermission(CONTRACTS_RETURN_PERMISSION),
      canReconcile: hasPermission(CONTRACTS_RECONCILE_PERMISSION),
      canClose: hasPermission(CONTRACTS_CLOSE_PERMISSION),
      canRenew: hasPermission(CONTRACTS_RENEW_PERMISSION),
    }),
    [hasPermission],
  );

  const actions = store.detail
    ? getContractActions(store.detail, permissions)
    : null;

  return {
    detail: store.detail,
    detailStatus: store.detailStatus,
    detailError: store.detailError,
    issuedLink: store.issuedLink,
    actions,
    permissions,
    offerPending: store.offer.pending,
    offerError: store.offer.error,
    rentalLinkPending: store.rentalLink.pending,
    paymentPending: store.payment.pending,
    paymentError: store.payment.error,
    carOutPending: store.carOut.pending,
    carOutError: store.carOut.error,
    carInPending: store.carIn.pending,
    carInError: store.carIn.error,
    returnLinkPending: store.returnLink.pending,
    returnLinkError: store.returnLink.error,
    renewPending: store.renewSlot.pending,
    renewError: store.renewSlot.error,
    reconcilePending: store.reconcileSlot.pending,
    reconcileError: store.reconcileSlot.error,
    closePending: store.closeSlot.pending,
    closeError: store.closeSlot.error,
    locale,
    loadContract: store.fetchContract,
    clearContract: store.clearDetail,
    clearIssuedLink: store.clearIssuedLink,
    createOffer: (payload, generateLink = true) =>
      store.createOffer(payload, locale, generateLink),
    generateRentalLink: (id) => store.generateRentalLink(id, locale),
    confirmPayment: store.confirmPayment,
    submitCarOut: store.submitCarOut,
    submitCarIn: store.submitCarIn,
    generateReturnLink: (id) => store.generateReturnLink(id, locale),
    generateRenewalLink: (id, payload) => store.generateRenewalLink(id, locale, payload),
    renew: store.renew,
    reconcile: store.reconcile,
    close: store.close,
    clearOfferError: store.clearOfferError,
    clearPaymentError: store.clearPaymentError,
    clearCarOutError: store.clearCarOutError,
    clearCarInError: store.clearCarInError,
    clearRenewError: store.clearRenewError,
    clearReconcileError: store.clearReconcileError,
    clearCloseError: store.clearCloseError,
  };
}
