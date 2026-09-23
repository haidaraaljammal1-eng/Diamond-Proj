"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  clearPublicOfficialSignature,
  getPublicOfficialContract,
  reviewPublicOfficialContract,
  submitPublicOfficialContractReview,
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
import {
  buildDevTestDataFill,
  collectContractCompletionIssues,
  type ContractRequirementCode,
  firstScrollTargetField,
  missingRequirementReviewFields,
} from "../utils/official-contract-completion";

export type OfficialContractLoadStatus = "idle" | "loading" | "ready" | "error";
export type OfficialContractSaveStatus = "idle" | "saving" | "saved" | "error";
export type OfficialContractSignStatus = "idle" | "signing" | "signed" | "error";

/**
 * In-memory review state. Never persisted in the browser. Local text edits,
 * drawings and signature captures survive a failed save. Card entry is
 * Stripe-hosted, never a Diamond-owned PAN input.
 */
interface OfficialContractState {
  token: string | null;
  status: OfficialContractLoadStatus;
  view: OfficialContractView | null;
  loadError: ApiRequestError | null;
  edits: OfficialContractEdits;
  damageOut: DamageMark[] | undefined;
  pendingSignatures: Partial<Record<OfficialSignatureSlot, Blob | "CLEAR">>;
  saveStatus: OfficialContractSaveStatus;
  saveError: ApiRequestError | null;
  invalidFields: string[];
  missingRequirements: ContractRequirementCode[];
  signStatus: OfficialContractSignStatus;
  signError: ApiRequestError | null;
  missingSignatures: OfficialSignatureSlot[];
  scrollTargetField: OfficialContractReviewField | null;
  load: (token: string) => Promise<void>;
  setEdit: (field: OfficialContractReviewField, value: string) => void;
  setDamageOut: (marks: DamageMark[]) => void;
  setSignature: (slot: OfficialSignatureSlot, image: Blob | null) => void;
  fillDevTestData: () => void;
  clearCompletionErrors: () => void;
  /** Saves pending changes. Resolves true when nothing is pending afterwards. */
  save: () => Promise<boolean>;
  /** Saves, then signs through the real Backend flow. */
  sign: () => Promise<boolean>;
  reset: () => void;
}

const empty = {
  token: null as string | null,
  status: "idle" as OfficialContractLoadStatus,
  view: null as OfficialContractView | null,
  loadError: null as ApiRequestError | null,
  edits: {} as OfficialContractEdits,
  damageOut: undefined as DamageMark[] | undefined,
  pendingSignatures: {} as Partial<Record<OfficialSignatureSlot, Blob | "CLEAR">>,
  saveStatus: "idle" as OfficialContractSaveStatus,
  saveError: null as ApiRequestError | null,
  invalidFields: [] as string[],
  missingRequirements: [] as ContractRequirementCode[],
  signStatus: "idle" as OfficialContractSignStatus,
  signError: null as ApiRequestError | null,
  missingSignatures: [] as OfficialSignatureSlot[],
  scrollTargetField: null as OfficialContractReviewField | null,
};

let loadSeq = 0;

export function hasPendingChanges(state: Pick<OfficialContractState, "edits" | "damageOut" | "pendingSignatures">): boolean {
  return (
    Object.keys(state.edits).length > 0 ||
    state.damageOut !== undefined ||
    Object.keys(state.pendingSignatures).length > 0
  );
}

export const useOfficialContractStore = create<OfficialContractState>((set, get) => {
  const touched = () => ({
    saveStatus: get().saveStatus === "saved" ? ("idle" as const) : get().saveStatus,
    missingSignatures: [],
  });

  const runCompletionValidation = (forSign: boolean): boolean => {
    const { view, edits, pendingSignatures } = get();
    if (!view) return false;
    const { missingRequirements, invalidFields } = collectContractCompletionIssues(view, edits);
    if (missingRequirements.length > 0 || invalidFields.length > 0) {
      set({
        missingRequirements,
        invalidFields,
        saveStatus: "error",
        saveError: null,
        signStatus: forSign ? "error" : get().signStatus,
        signError: forSign ? null : get().signError,
        scrollTargetField: firstScrollTargetField(missingRequirements, invalidFields),
      });
      return false;
    }
    if (forSign) {
      const missing = requiredSignatureSlots(view, edits).filter((slot) => {
        const local = pendingSignatures[slot];
        if (local === "CLEAR") return true;
        if (local) return false;
        return view.signatures[slot].status !== "SIGNED";
      });
      if (missing.length > 0) {
        set({
          missingSignatures: missing,
          signStatus: "error",
          signError: null,
          missingRequirements: [],
          invalidFields: [],
          scrollTargetField: null,
        });
        return false;
      }
    }
    set({
      missingRequirements: [],
      invalidFields: [],
      missingSignatures: [],
      scrollTargetField: null,
    });
    return true;
  };

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
        missingRequirements: state.missingRequirements.filter(
          (code) => !missingRequirementReviewFields([code]).includes(field),
        ),
        scrollTargetField: null,
        ...touched(),
      }));
    },

    fillDevTestData() {
      const { view, edits } = get();
      if (!view) return;
      set({
        edits: buildDevTestDataFill(view, edits),
        invalidFields: [],
        missingRequirements: [],
        scrollTargetField: null,
        ...touched(),
      });
    },

    clearCompletionErrors() {
      set({ invalidFields: [], missingRequirements: [], scrollTargetField: null });
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

    async save() {
      const { token, view, edits, pendingSignatures } = get();
      if (!token || !view) return false;
      if (!runCompletionValidation(false)) return false;
      const patch = buildReviewPatch(view, edits);
      const invalid = invalidReviewFields(patch);
      if (invalid.length > 0) {
        set({ invalidFields: invalid, saveStatus: "error", saveError: null });
        return false;
      }
      const signatureEntries = Object.entries(pendingSignatures) as Array<[OfficialSignatureSlot, Blob | "CLEAR"]>;
      if (view.contract.status !== "AWAITING" && Object.keys(patch).length === 0 && signatureEntries.length === 0) {
        set({ edits: {}, damageOut: undefined, saveStatus: "idle", saveError: null, invalidFields: [] });
        return true;
      }
      set({ saveStatus: "saving", saveError: null, invalidFields: [] });
      try {
        let reconciled = view;
        if (Object.keys(patch).length > 0) {
          reconciled = await reviewPublicOfficialContract(token, patch);
          set({ view: reconciled, edits: {}, damageOut: undefined });
        }
        if (reconciled.contract.status === "AWAITING") {
          reconciled = await submitPublicOfficialContractReview(token);
          set({ view: reconciled });
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

    async sign() {
      const state = get();
      if (!state.token || !state.view) return false;
      if (!runCompletionValidation(true)) return false;
      set({ signStatus: "signing", signError: null, missingSignatures: [], missingRequirements: [] });
      const saved = await get().save();
      if (!saved) {
        set({ signStatus: "idle" });
        return false;
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
