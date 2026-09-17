"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  clearPublicOfficialSignature,
  getPublicOfficialContract,
  reviewPublicOfficialContract,
  savePublicOfficialSignature,
  signPublicOfficialContract,
} from "../api/public-rental.api";
import type {
  DamageMark,
  OfficialContractEdits,
  OfficialContractReviewField,
  OfficialContractView,
  OfficialSignatureSlot,
} from "../types/official-contract.types";
import {
  buildReviewPatch,
  invalidReviewFields,
  requiredSignatureSlots,
  SIGNATURE_SLOT_PATHS,
} from "../utils/official-contract-document";

export type OfficialContractLoadStatus = "idle" | "loading" | "ready" | "error";
export type OfficialContractSaveStatus = "idle" | "saving" | "saved" | "error";
export type OfficialContractSignStatus = "idle" | "signing" | "signed" | "error";

/**
 * In-memory review state. Never persisted in the browser. Local edits,
 * drawings, marks and typed card digits survive a failed save. The full card
 * number stays here; only its last 4 digits are ever sent.
 */
interface OfficialContractState {
  token: string | null;
  status: OfficialContractLoadStatus;
  view: OfficialContractView | null;
  loadError: ApiRequestError | null;
  edits: OfficialContractEdits;
  cardDigits: string | null;
  damageOut: DamageMark[] | undefined;
  pendingSignatures: Partial<Record<OfficialSignatureSlot, Blob | "CLEAR">>;
  saveStatus: OfficialContractSaveStatus;
  saveError: ApiRequestError | null;
  invalidFields: string[];
  signStatus: OfficialContractSignStatus;
  signError: ApiRequestError | null;
  missingSignatures: OfficialSignatureSlot[];
  load: (token: string) => Promise<void>;
  setEdit: (field: OfficialContractReviewField, value: string) => void;
  setCardDigits: (digits: string) => void;
  setDamageOut: (marks: DamageMark[]) => void;
  setSignature: (slot: OfficialSignatureSlot, image: Blob | null) => void;
  /** Saves pending changes. Resolves true when nothing is pending afterwards. */
  save: (options?: { persist?: boolean }) => Promise<boolean>;
  /** Saves, then signs. With `persist: false` (demo) nothing reaches the Backend. */
  sign: (options?: { persist?: boolean }) => Promise<boolean>;
  reset: () => void;
}

const empty = {
  token: null as string | null,
  status: "idle" as OfficialContractLoadStatus,
  view: null as OfficialContractView | null,
  loadError: null as ApiRequestError | null,
  edits: {} as OfficialContractEdits,
  cardDigits: null as string | null,
  damageOut: undefined as DamageMark[] | undefined,
  pendingSignatures: {} as Partial<Record<OfficialSignatureSlot, Blob | "CLEAR">>,
  saveStatus: "idle" as OfficialContractSaveStatus,
  saveError: null as ApiRequestError | null,
  invalidFields: [] as string[],
  signStatus: "idle" as OfficialContractSignStatus,
  signError: null as ApiRequestError | null,
  missingSignatures: [] as OfficialSignatureSlot[],
};

let loadSeq = 0;

export function hasPendingChanges(state: Pick<OfficialContractState, "edits" | "cardDigits" | "damageOut" | "pendingSignatures">): boolean {
  return (
    Object.keys(state.edits).length > 0 ||
    state.cardDigits !== null ||
    state.damageOut !== undefined ||
    Object.keys(state.pendingSignatures).length > 0
  );
}

export const useOfficialContractStore = create<OfficialContractState>((set, get) => {
  const touched = () => ({
    saveStatus: get().saveStatus === "saved" ? ("idle" as const) : get().saveStatus,
    missingSignatures: [],
  });

  return {
    ...empty,

    async load(token) {
      const seq = ++loadSeq;
      set({ token, status: "loading", loadError: null });
      try {
        const view = await getPublicOfficialContract(token);
        if (seq !== loadSeq) return;
        set({ view, status: "ready" });
      } catch (error) {
        if (seq !== loadSeq) return;
        set({ status: "error", loadError: normalizeApiError(error) });
      }
    },

    setEdit(field, value) {
      set((state) => ({
        edits: { ...state.edits, [field]: value },
        invalidFields: state.invalidFields.filter((f) => f !== field),
        ...touched(),
      }));
    },

    setCardDigits(digits) {
      set((state) => ({
        cardDigits: digits.replace(/\D/g, ""),
        invalidFields: state.invalidFields.filter((f) => f !== "cardNumberLast4"),
        ...touched(),
      }));
    },

    setDamageOut(marks) {
      set({ damageOut: marks, ...touched() });
    },

    setSignature(slot, image) {
      set((state) => ({
        pendingSignatures: { ...state.pendingSignatures, [slot]: image ?? "CLEAR" },
        ...touched(),
      }));
    },

    async save(options = {}) {
      const { token, view, edits, cardDigits, damageOut, pendingSignatures } = get();
      if (!token || !view) return false;
      const patch = buildReviewPatch(view, edits, { cardDigits, damageOut });
      const invalid = invalidReviewFields(patch);
      if (invalid.length > 0) {
        set({ invalidFields: invalid, saveStatus: "error", saveError: null });
        return false;
      }
      const signatureEntries = Object.entries(pendingSignatures) as Array<[OfficialSignatureSlot, Blob | "CLEAR"]>;
      if (Object.keys(patch).length === 0 && signatureEntries.length === 0) {
        set({ edits: {}, cardDigits: null, damageOut: undefined, saveStatus: "idle", saveError: null, invalidFields: [] });
        return true;
      }
      // Demo simulation keeps everything in the browser.
      if (options.persist === false) {
        set({ saveStatus: "saved", saveError: null, invalidFields: [] });
        return true;
      }
      set({ saveStatus: "saving", saveError: null, invalidFields: [] });
      try {
        let reconciled = view;
        if (Object.keys(patch).length > 0) {
          reconciled = await reviewPublicOfficialContract(token, patch);
          set({ view: reconciled, edits: {}, cardDigits: null, damageOut: undefined });
        }
        for (const [slot, image] of signatureEntries) {
          const path = SIGNATURE_SLOT_PATHS[slot];
          reconciled =
            image === "CLEAR"
              ? await clearPublicOfficialSignature(token, path)
              : await savePublicOfficialSignature(token, path, image);
          set((state) => {
            const rest = { ...state.pendingSignatures };
            delete rest[slot];
            return { view: reconciled, pendingSignatures: rest };
          });
        }
        set({ saveStatus: "saved" });
        return true;
      } catch (error) {
        set({ saveStatus: "error", saveError: normalizeApiError(error) });
        return false;
      }
    },

    async sign(options = {}) {
      const state = get();
      if (!state.token || !state.view) return false;
      const missing = requiredSignatureSlots(state.view, state.edits).filter((slot) => {
        const local = state.pendingSignatures[slot];
        if (local === "CLEAR") return true;
        if (local) return false;
        return state.view!.signatures[slot].status !== "SIGNED";
      });
      if (missing.length > 0) {
        set({ missingSignatures: missing, signStatus: "error", signError: null });
        return false;
      }
      set({ signStatus: "signing", signError: null, missingSignatures: [] });
      const saved = await get().save(options);
      if (!saved) {
        set({ signStatus: "idle" });
        return false;
      }
      if (options.persist === false) {
        set({ signStatus: "signed" });
        return true;
      }
      try {
        const view = await signPublicOfficialContract(state.token, state.view.contract.termsVersion);
        set({ view, signStatus: "signed" });
        return true;
      } catch (error) {
        set({ signStatus: "error", signError: normalizeApiError(error) });
        return false;
      }
    },

    reset() {
      loadSeq += 1;
      set({ ...empty });
    },
  };
});
