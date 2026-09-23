"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { refreshAfterPending } from "@/infrastructure/state/refresh-after-pending";
import { useVehiclesStore } from "@/modules/vehicles/stores/vehicles.store";
import {
  closeContract as closeContractRequest,
  confirmContractPayment as confirmPaymentRequest,
  createContractOffer as createOfferRequest,
  generateRentalLink as generateRentalLinkRequest,
  generateRenewalLink as generateRenewalLinkRequest,
  generateReturnLink as generateReturnLinkRequest,
  getContract,
  getContracts,
  reconcileContract as reconcileRequest,
  renewContract as renewRequest,
  submitCarOut as submitCarOutRequest,
  getCarOut as getCarOutRequest,
  saveCarOutDraft as saveCarOutDraftRequest,
  uploadCarOutPhoto as uploadCarOutPhotoRequest,
  uploadCarOutSignature as uploadCarOutSignatureRequest,
  deleteCarOutPhoto as deleteCarOutPhotoRequest,
  completeCarOut as completeCarOutRequest,
  getCarIn as getCarInRequest,
  saveCarInDraft as saveCarInDraftRequest,
  uploadCarInPhoto as uploadCarInPhotoRequest,
  uploadCarInSignature as uploadCarInSignatureRequest,
  deleteCarInPhoto as deleteCarInPhotoRequest,
  completeCarIn as completeCarInRequest,
  uploadContractAttachment,
} from "../api/contracts.api";
import type { PageMeta } from "../api/contracts.api.types";
import { CONTRACTS_PAGE_SIZE } from "../api/contracts.api.types";
import type {
  CarInDraftPatch,
  CarOutPayload,
  CarOutDraftPatch,
  ContractCarInHandoverDto,
  ContractCarOutHandoverDto,
  CarOutAngle,
  ConfirmContractPaymentPayload,
  ContractDetailDto,
  ContractFiltersState,
  ContractListItemDto,
  CreateContractOfferPayload,
  InspectionPhotoInput,
  IssuedContractLinkView,
  ReconcilePayload,
  RenewPayload,
} from "../types/contract.types";
import { DEFAULT_CONTRACT_FILTERS } from "../utils/contract-filters";
import { createListRequestGate } from "../utils/list-request-gate";
import { buildPublicContractUrl } from "../utils/contract-link";
import type { InspectionAngle } from "../types/contract.types";

export type ContractsLoadStatus = "idle" | "loading" | "ready" | "error";
export type ContractDetailLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ContractsQuery extends ContractFiltersState {
  page: number;
  pageSize: number;
}

interface MutationSlot {
  pending: boolean;
  error: ApiRequestError | null;
}

interface ContractsState {
  contracts: ContractListItemDto[];
  meta: PageMeta | null;
  query: ContractsQuery;
  status: ContractsLoadStatus;
  error: ApiRequestError | null;
  detail: ContractDetailDto | null;
  detailContractId: string | null;
  detailStatus: ContractDetailLoadStatus;
  detailError: ApiRequestError | null;
  issuedLink: IssuedContractLinkView | null;
  offer: MutationSlot;
  rentalLink: MutationSlot;
  payment: MutationSlot;
  carOut: MutationSlot;
  carOutHandover: ContractCarOutHandoverDto | null;
  carIn: MutationSlot;
  carInHandover: ContractCarInHandoverDto | null;
  returnLink: MutationSlot;
  renewSlot: MutationSlot;
  reconcileSlot: MutationSlot;
  closeSlot: MutationSlot;
  load: () => Promise<void>;
  /** `quiet` re-reads the list without the loading state (background revalidation). */
  refresh: (options?: { quiet?: boolean }) => Promise<void>;
  setQuery: (partial: Partial<ContractsQuery>) => void;
  resetFilters: () => void;
  fetchContract: (id: string) => Promise<void>;
  clearDetail: () => void;
  clearIssuedLink: () => void;
  createOffer: (
    payload: CreateContractOfferPayload,
    locale: string,
    generateLink: boolean,
  ) => Promise<ContractDetailDto | null>;
  generateRentalLink: (id: string, locale: string) => Promise<boolean>;
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
  loadCarOut: (id: string) => Promise<void>;
  saveCarOutDraft: (id: string, payload: CarOutDraftPatch) => Promise<boolean>;
  uploadCarOutPhoto: (id: string, angle: CarOutAngle, file: File) => Promise<boolean>;
  uploadCarOutSignature: (id: string, file: File) => Promise<boolean>;
  deleteCarOutPhoto: (id: string, photoId: string) => Promise<boolean>;
  completeCarOut: (id: string, idempotencyKey: string) => Promise<boolean>;
  loadCarIn: (id: string) => Promise<void>;
  saveCarInDraft: (id: string, payload: CarInDraftPatch) => Promise<boolean>;
  uploadCarInPhoto: (id: string, angle: CarOutAngle, file: File) => Promise<boolean>;
  uploadCarInSignature: (id: string, file: File) => Promise<boolean>;
  deleteCarInPhoto: (id: string, photoId: string) => Promise<boolean>;
  completeCarIn: (id: string, idempotencyKey: string) => Promise<boolean>;
  generateReturnLink: (id: string, locale: string) => Promise<boolean>;
  generateRenewalLink: (
    id: string,
    locale: string,
    payload: RenewPayload,
  ) => Promise<boolean>;
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
  clearReturnLinkError: () => void;
}

const IDLE_SLOT: MutationSlot = { pending: false, error: null };

/** Uploads the drawn custody signature (PNG) and returns its attachment id. */
async function uploadHirerSignature(image: Blob | null | undefined): Promise<string | undefined> {
  if (!image) return undefined;
  const file = new File([image], "hirer-signature.png", { type: "image/png" });
  return (await uploadContractAttachment(file)).id;
}

const listGate = createListRequestGate();
let detailInFlight: Promise<void> | null = null;

function toIssuedLink(
  dto: {
    contractId: string;
    contractNumber: string;
    link: { token: string; expiresAt: string; type: IssuedContractLinkView["type"] };
  },
  locale: string,
): IssuedContractLinkView {
  return {
    contractId: dto.contractId,
    contractNumber: dto.contractNumber,
    type: dto.link.type,
    url: buildPublicContractUrl(
      window.location.origin,
      locale,
      dto.link.type,
      dto.link.token,
    ),
    expiresAt: dto.link.expiresAt,
  };
}

async function refreshFleet(): Promise<void> {
  await useVehiclesStore.getState().refresh();
}

export const useContractsStore = create<ContractsState>((set, get) => {
  async function fetchList(isCurrent: () => boolean, quiet: boolean): Promise<void> {
    const { query } = get();
    if (!quiet) set({ status: "loading", error: null });
    try {
      const result = await getContracts(query);
      // A newer query started while this one was in flight: its rows win.
      if (!isCurrent()) return;
      set({
        contracts: result.data,
        meta: result.meta,
        status: "ready",
        error: null,
      });
    } catch (error) {
      if (!isCurrent()) return;
      // A failed background re-read keeps the rows already on screen.
      if (quiet && get().status === "ready") return;
      set({ status: "error", error: normalizeApiError(error) });
    }
  }

  function runList(quiet = false): Promise<void> {
    return listGate.run(JSON.stringify(get().query), (isCurrent) => fetchList(isCurrent, quiet));
  }

  function refreshList(): Promise<void> {
    return refreshAfterPending(() => listGate.current(), () => runList());
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([refreshList(), refreshFleet()]);
    const detailId = get().detailContractId;
    if (detailId) await get().fetchContract(detailId);
  }

  async function refreshContractState(id: string): Promise<void> {
    await Promise.all([refreshList(), get().fetchContract(id)]);
  }

  return {
    contracts: [],
    meta: null,
    query: {
      ...DEFAULT_CONTRACT_FILTERS,
      page: 1,
      pageSize: CONTRACTS_PAGE_SIZE,
    },
    status: "idle",
    error: null,
    detail: null,
    detailContractId: null,
    detailStatus: "idle",
    detailError: null,
    issuedLink: null,
    offer: IDLE_SLOT,
    rentalLink: IDLE_SLOT,
    payment: IDLE_SLOT,
    carOut: IDLE_SLOT,
    carOutHandover: null,
    carIn: IDLE_SLOT,
    carInHandover: null,
    returnLink: IDLE_SLOT,
    renewSlot: IDLE_SLOT,
    reconcileSlot: IDLE_SLOT,
    closeSlot: IDLE_SLOT,
    load() {
      const status = get().status;
      if (status === "ready" || status === "loading") {
        return listGate.current() ?? Promise.resolve();
      }
      return runList();
    },
    /** A quiet background re-read joins whatever is in flight; an explicit refresh waits it out and takes a new snapshot. */
    refresh(options) {
      return options?.quiet ? runList(true) : refreshList();
    },
    setQuery(partial) {
      set((state) => ({
        query: { ...state.query, ...partial },
        status: "idle",
      }));
      void refreshList();
    },
    resetFilters() {
      set((state) => ({
        query: { ...state.query, ...DEFAULT_CONTRACT_FILTERS, page: 1 },
        status: "idle",
      }));
      void refreshList();
    },
    async fetchContract(id) {
      if (detailInFlight) await detailInFlight;
      set({
        detailContractId: id,
        detailStatus: "loading",
        detailError: null,
      });
      detailInFlight = (async () => {
        try {
          const detail = await getContract(id);
          set({ detail, detailStatus: "ready", detailError: null });
        } catch (error) {
          set({
            detail: null,
            detailStatus: "error",
            detailError: normalizeApiError(error),
          });
        }
      })().finally(() => {
        detailInFlight = null;
      });
      await detailInFlight;
    },
    clearDetail() {
      set({
        detail: null,
        detailContractId: null,
        detailStatus: "idle",
        detailError: null,
      });
    },
    clearIssuedLink() {
      set({ issuedLink: null });
    },
    async createOffer(payload, locale, generateLink) {
      set({ offer: { pending: true, error: null } });
      try {
        const contract = await createOfferRequest(payload);
        set({
          offer: IDLE_SLOT,
          detail: contract,
          detailContractId: contract.id,
          detailStatus: "ready",
        });
        if (generateLink) {
          try {
            const issued = await generateRentalLinkRequest(contract.id);
            set({
              issuedLink: {
                ...toIssuedLink(issued, locale),
                collectionMode: payload.collectionMode,
              },
            });
          } catch (linkError) {
            set({ rentalLink: { pending: false, error: normalizeApiError(linkError) } });
          }
        }
        await refreshAll();
        return contract;
      } catch (error) {
        set({ offer: { pending: false, error: normalizeApiError(error) } });
        return null;
      }
    },
    async generateRentalLink(id, locale) {
      set({ rentalLink: { pending: true, error: null } });
      try {
        const issued = await generateRentalLinkRequest(id);
        set({ rentalLink: IDLE_SLOT, issuedLink: toIssuedLink(issued, locale) });
        await refreshAll();
        return true;
      } catch (error) {
        set({ rentalLink: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async confirmPayment(id, payload, idempotencyKey) {
      set({ payment: { pending: true, error: null } });
      try {
        const detail = await confirmPaymentRequest(id, payload, idempotencyKey);
        set({ payment: IDLE_SLOT, detail, detailStatus: "ready" });
        await refreshAll();
        return true;
      } catch (error) {
        set({ payment: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async submitCarOut(id, payload, idempotencyKey) {
      set({ carOut: { pending: true, error: null } });
      try {
        const photos: InspectionPhotoInput[] = [];
        for (const photo of payload.photos) {
          const attachment = await uploadContractAttachment(photo.file);
          photos.push({ attachmentId: attachment.id, angle: photo.angle });
        }
        const detail = await submitCarOutRequest(
          id,
          {
            occurredAt: payload.occurredAt,
            mileageOut: payload.mileageOut,
            fuelOut: payload.fuelOut,
            notes: payload.notes,
            photos,
            damage: payload.damage,
            hirerSignatureAttachmentId: await uploadHirerSignature(payload.hirerSignature),
          },
          idempotencyKey,
        );
        set({ carOut: IDLE_SLOT, detail, detailStatus: "ready" });
        await refreshAll();
        return true;
      } catch (error) {
        set({ carOut: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async loadCarOut(id) {
      set({ carOutHandover: null });
      try {
        const handover = await getCarOutRequest(id);
        set({ carOutHandover: handover });
      } catch (error) {
        set({ carOut: { pending: false, error: normalizeApiError(error) } });
      }
    },
    async saveCarOutDraft(id, payload) {
      set({ carOut: { pending: true, error: null } });
      try {
        const handover = await saveCarOutDraftRequest(id, payload);
        set({ carOut: IDLE_SLOT, carOutHandover: handover });
        await refreshContractState(id);
        return true;
      } catch (error) {
        set({ carOut: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async uploadCarOutPhoto(id, angle, file) {
      set({ carOut: { pending: true, error: null } });
      try {
        const handover = await uploadCarOutPhotoRequest(id, angle, file);
        set({ carOut: IDLE_SLOT, carOutHandover: handover });
        await refreshContractState(id);
        return true;
      } catch (error) {
        set({ carOut: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async uploadCarOutSignature(id, file) {
      set({ carOut: { pending: true, error: null } });
      try {
        const handover = await uploadCarOutSignatureRequest(id, file);
        set({ carOut: IDLE_SLOT, carOutHandover: handover });
        await refreshContractState(id);
        return true;
      } catch (error) {
        set({ carOut: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async deleteCarOutPhoto(id, photoId) {
      set({ carOut: { pending: true, error: null } });
      try {
        const handover = await deleteCarOutPhotoRequest(id, photoId);
        set({ carOut: IDLE_SLOT, carOutHandover: handover });
        await refreshContractState(id);
        return true;
      } catch (error) {
        set({ carOut: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async completeCarOut(id, idempotencyKey) {
      set({ carOut: { pending: true, error: null } });
      try {
        const detail = await completeCarOutRequest(id, idempotencyKey);
        set({ carOut: IDLE_SLOT, detail, detailStatus: "ready", carOutHandover: detail.carOutHandover });
        await refreshAll();
        return true;
      } catch (error) {
        set({ carOut: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async loadCarIn(id) {
      set({ carInHandover: null });
      try {
        const handover = await getCarInRequest(id);
        set({ carInHandover: handover });
      } catch (error) {
        set({ carIn: { pending: false, error: normalizeApiError(error) } });
      }
    },
    async saveCarInDraft(id, payload) {
      set({ carIn: { pending: true, error: null } });
      try {
        const handover = await saveCarInDraftRequest(id, payload);
        set({ carIn: IDLE_SLOT, carInHandover: handover });
        await refreshContractState(id);
        return true;
      } catch (error) {
        set({ carIn: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async uploadCarInPhoto(id, angle, file) {
      set({ carIn: { pending: true, error: null } });
      try {
        const handover = await uploadCarInPhotoRequest(id, angle, file);
        set({ carIn: IDLE_SLOT, carInHandover: handover });
        return true;
      } catch (error) {
        set({ carIn: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async uploadCarInSignature(id, file) {
      set({ carIn: { pending: true, error: null } });
      try {
        const handover = await uploadCarInSignatureRequest(id, file);
        set({ carIn: IDLE_SLOT, carInHandover: handover });
        await refreshContractState(id);
        return true;
      } catch (error) {
        set({ carIn: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async deleteCarInPhoto(id, photoId) {
      set({ carIn: { pending: true, error: null } });
      try {
        const handover = await deleteCarInPhotoRequest(id, photoId);
        set({ carIn: IDLE_SLOT, carInHandover: handover });
        return true;
      } catch (error) {
        set({ carIn: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    /** RETOUT → REVIEW and vehicle RENTED → AVAILABLE, both authoritative from the response. */
    async completeCarIn(id, idempotencyKey) {
      set({ carIn: { pending: true, error: null } });
      try {
        const detail = await completeCarInRequest(id, idempotencyKey);
        set({ carIn: IDLE_SLOT, detail, detailStatus: "ready", carInHandover: detail.carInHandover });
        await refreshAll();
        return true;
      } catch (error) {
        set({ carIn: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async generateReturnLink(id, locale) {
      set({ returnLink: { pending: true, error: null } });
      try {
        const issued = await generateReturnLinkRequest(id);
        set({ returnLink: IDLE_SLOT, issuedLink: toIssuedLink(issued, locale) });
        await refreshAll();
        return true;
      } catch (error) {
        set({ returnLink: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async generateRenewalLink(id, locale, payload) {
      set({ renewSlot: { pending: true, error: null } });
      try {
        const issued = await generateRenewalLinkRequest(id, payload);
        set({ renewSlot: IDLE_SLOT, issuedLink: toIssuedLink(issued, locale) });
        await refreshAll();
        return true;
      } catch (error) {
        set({ renewSlot: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async renew(id, payload, idempotencyKey) {
      set({ renewSlot: { pending: true, error: null } });
      try {
        const detail = await renewRequest(id, payload, idempotencyKey);
        set({ renewSlot: IDLE_SLOT, detail, detailStatus: "ready" });
        await refreshAll();
        return true;
      } catch (error) {
        set({ renewSlot: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async reconcile(id, payload) {
      set({ reconcileSlot: { pending: true, error: null } });
      try {
        const detail = await reconcileRequest(id, payload);
        set({ reconcileSlot: IDLE_SLOT, detail, detailStatus: "ready" });
        await refreshAll();
        return true;
      } catch (error) {
        set({ reconcileSlot: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    async close(id, idempotencyKey) {
      set({ closeSlot: { pending: true, error: null } });
      try {
        const detail = await closeContractRequest(id, idempotencyKey);
        set({ closeSlot: IDLE_SLOT, detail, detailStatus: "ready" });
        await refreshAll();
        return true;
      } catch (error) {
        set({ closeSlot: { pending: false, error: normalizeApiError(error) } });
        return false;
      }
    },
    clearOfferError() {
      set({ offer: { ...get().offer, error: null } });
    },
    clearPaymentError() {
      set({ payment: { ...get().payment, error: null } });
    },
    clearCarOutError() {
      set({ carOut: { ...get().carOut, error: null } });
    },
    clearCarInError() {
      set({ carIn: { ...get().carIn, error: null } });
    },
    clearRenewError() {
      set({ renewSlot: { ...get().renewSlot, error: null } });
    },
    clearReconcileError() {
      set({ reconcileSlot: { ...get().reconcileSlot, error: null } });
    },
    clearCloseError() {
      set({ closeSlot: { ...get().closeSlot, error: null } });
    },
    clearReturnLinkError() {
      set({ returnLink: { ...get().returnLink, error: null } });
    },
  };
});
