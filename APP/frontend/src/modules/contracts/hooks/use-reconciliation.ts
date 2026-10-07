"use client";

import { useCallback, useRef, useState } from "react";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useContractsStore } from "../stores/contracts.store";
import {
  addReconciliationLine,
  confirmReconciliationRoadLiabilityCharge,
  deleteReconciliationLine,
  finalizeReconciliation,
  generateReconciliationLink,
  getFullReconciliation,
  settleReconciliationCash,
  updateReconciliationLine,
} from "../api/reconciliation.api";
import { settleRenewalCash as settleRenewalCashRequest } from "../api/contracts.api";
import type {
  ConfirmReconciliationRoadLiabilityPayload,
  FullReconciliationReadDto,
  ReconciliationLineInputPayload,
  ReconciliationLinkIssuedDto,
} from "../types/reconciliation.types";
import { createIdempotencyKey } from "../utils/contract-link";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface MutationSlot {
  pending: boolean;
  error: ApiRequestError | null;
}

const idleMutation = (): MutationSlot => ({ pending: false, error: null });

/** Survives dialog close/reopen within the same browser tab; backend `paymentLink.active` remains authoritative. */
const issuedLinkByContractId = new Map<string, ReconciliationLinkIssuedDto>();

export interface UseReconciliationResult {
  data: FullReconciliationReadDto | null;
  status: LoadStatus;
  error: ApiRequestError | null;
  issuedLink: ReconciliationLinkIssuedDto | null;
  lineMutation: MutationSlot;
  roadLiabilityMutation: MutationSlot;
  finalizeMutation: MutationSlot;
  cashMutation: MutationSlot;
  renewalCashMutation: MutationSlot;
  linkMutation: MutationSlot;
  load: (contractId: string) => Promise<void>;
  refresh: (contractId: string) => Promise<void>;
  clear: () => void;
  clearIssuedLink: () => void;
  clearMutationErrors: () => void;
  addDamageLine: (
    contractId: string,
    payload: ReconciliationLineInputPayload,
  ) => Promise<boolean>;
  updateDamageLine: (
    contractId: string,
    lineId: string,
    payload: ReconciliationLineInputPayload,
  ) => Promise<boolean>;
  deleteDamageLine: (contractId: string, lineId: string) => Promise<boolean>;
  addFuelLine: (
    contractId: string,
    payload: ReconciliationLineInputPayload,
  ) => Promise<boolean>;
  updateFuelLine: (
    contractId: string,
    lineId: string,
    payload: ReconciliationLineInputPayload,
  ) => Promise<boolean>;
  deleteFuelLine: (contractId: string, lineId: string) => Promise<boolean>;
  confirmRoadLiability: (
    contractId: string,
    roadLiabilityId: string,
    payload: ConfirmReconciliationRoadLiabilityPayload,
  ) => Promise<boolean>;
  finalize: (contractId: string) => Promise<boolean>;
  settleCash: (contractId: string) => Promise<boolean>;
  settleRenewalCash: (contractId: string, renewalId: string) => Promise<boolean>;
  generateLink: (contractId: string) => Promise<boolean>;
}

async function refreshContractDetail(contractId: string): Promise<void> {
  await useContractsStore.getState().fetchContract(contractId);
  await useContractsStore.getState().refresh({ quiet: true });
}

export function useReconciliation(): UseReconciliationResult {
  const [data, setData] = useState<FullReconciliationReadDto | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [issuedLink, setIssuedLink] = useState<ReconciliationLinkIssuedDto | null>(null);
  const [lineMutation, setLineMutation] = useState<MutationSlot>(idleMutation());
  const [roadLiabilityMutation, setRoadLiabilityMutation] = useState<MutationSlot>(idleMutation());
  const [finalizeMutation, setFinalizeMutation] = useState<MutationSlot>(idleMutation());
  const [cashMutation, setCashMutation] = useState<MutationSlot>(idleMutation());
  const [renewalCashMutation, setRenewalCashMutation] = useState<MutationSlot>(idleMutation());
  const [linkMutation, setLinkMutation] = useState<MutationSlot>(idleMutation());
  const loadGeneration = useRef(0);
  const renewalCashKeyRef = useRef(createIdempotencyKey());

  const load = useCallback(async (contractId: string) => {
    const generation = ++loadGeneration.current;
    setStatus("loading");
    setError(null);
    try {
      const next = await getFullReconciliation(contractId);
      if (generation !== loadGeneration.current) return;
      setData(next);
      if (next.reconciliation.settled) {
        issuedLinkByContractId.delete(contractId);
        setIssuedLink(null);
      } else {
        setIssuedLink(issuedLinkByContractId.get(contractId) ?? null);
      }
      setStatus("ready");
    } catch (cause) {
      if (generation !== loadGeneration.current) return;
      setData(null);
      setStatus("error");
      setError(normalizeApiError(cause));
    }
  }, []);

  const refresh = useCallback(async (contractId: string) => {
    const generation = ++loadGeneration.current;
    setStatus("loading");
    setError(null);
    try {
      const next = await getFullReconciliation(contractId);
      if (generation !== loadGeneration.current) return;
      setData(next);
      if (next.reconciliation.settled) {
        issuedLinkByContractId.delete(contractId);
        setIssuedLink(null);
      } else {
        setIssuedLink(issuedLinkByContractId.get(contractId) ?? null);
      }
      setStatus("ready");
    } catch (cause) {
      if (generation !== loadGeneration.current) return;
      setError(normalizeApiError(cause));
      setStatus("error");
    }
  }, []);

  const clear = useCallback(() => {
    loadGeneration.current += 1;
    setData(null);
    setStatus("idle");
    setError(null);
    setIssuedLink(null);
    setLineMutation(idleMutation());
    setRoadLiabilityMutation(idleMutation());
    setFinalizeMutation(idleMutation());
    setCashMutation(idleMutation());
    setRenewalCashMutation(idleMutation());
    setLinkMutation(idleMutation());
  }, []);

  const afterMutation = useCallback(async (contractId: string) => {
    await refresh(contractId);
    await refreshContractDetail(contractId);
  }, [refresh]);

  const refreshAfterFinancialSuccess = useCallback(async (contractId: string) => {
    await refreshContractDetail(contractId);
    const generation = ++loadGeneration.current;
    setError(null);
    try {
      const next = await getFullReconciliation(contractId);
      if (generation !== loadGeneration.current) return;
      setData(next);
      if (next.reconciliation.settled) {
        issuedLinkByContractId.delete(contractId);
        setIssuedLink(null);
      } else {
        setIssuedLink(issuedLinkByContractId.get(contractId) ?? null);
      }
      setStatus("ready");
    } catch {
      if (generation !== loadGeneration.current) return;
      setStatus((current) => (current === "loading" ? "ready" : current));
    }
  }, []);

  const addDamageLine = useCallback(
    async (contractId: string, payload: ReconciliationLineInputPayload) => {
      setLineMutation({ pending: true, error: null });
      try {
        await addReconciliationLine(contractId, payload);
        setLineMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setLineMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  const updateDamageLine = useCallback(
    async (contractId: string, lineId: string, payload: ReconciliationLineInputPayload) => {
      setLineMutation({ pending: true, error: null });
      try {
        await updateReconciliationLine(contractId, lineId, payload);
        setLineMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setLineMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  const deleteDamageLine = useCallback(
    async (contractId: string, lineId: string) => {
      setLineMutation({ pending: true, error: null });
      try {
        await deleteReconciliationLine(contractId, lineId);
        setLineMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setLineMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  const addFuelLine = useCallback(
    async (contractId: string, payload: ReconciliationLineInputPayload) => {
      setLineMutation({ pending: true, error: null });
      try {
        await addReconciliationLine(contractId, payload);
        setLineMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setLineMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  const updateFuelLine = useCallback(
    async (contractId: string, lineId: string, payload: ReconciliationLineInputPayload) => {
      setLineMutation({ pending: true, error: null });
      try {
        await updateReconciliationLine(contractId, lineId, payload);
        setLineMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setLineMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  const deleteFuelLine = useCallback(
    async (contractId: string, lineId: string) => {
      setLineMutation({ pending: true, error: null });
      try {
        await deleteReconciliationLine(contractId, lineId);
        setLineMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setLineMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  const confirmRoadLiability = useCallback(
    async (
      contractId: string,
      roadLiabilityId: string,
      payload: ConfirmReconciliationRoadLiabilityPayload,
    ) => {
      setRoadLiabilityMutation({ pending: true, error: null });
      try {
        await confirmReconciliationRoadLiabilityCharge(
          contractId,
          roadLiabilityId,
          payload,
          createIdempotencyKey(),
        );
        setRoadLiabilityMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setRoadLiabilityMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  const finalize = useCallback(
    async (contractId: string) => {
      setFinalizeMutation({ pending: true, error: null });
      try {
        await finalizeReconciliation(contractId, createIdempotencyKey());
        setFinalizeMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setFinalizeMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  const settleCash = useCallback(
    async (contractId: string) => {
      setCashMutation({ pending: true, error: null });
      try {
        await settleReconciliationCash(contractId, createIdempotencyKey());
        setCashMutation(idleMutation());
        await refreshAfterFinancialSuccess(contractId);
        return true;
      } catch (cause) {
        setCashMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [refreshAfterFinancialSuccess],
  );

  const settleRenewalCash = useCallback(
    async (contractId: string, renewalId: string) => {
      setRenewalCashMutation({ pending: true, error: null });
      try {
        await settleRenewalCashRequest(contractId, renewalId, renewalCashKeyRef.current);
        setRenewalCashMutation(idleMutation());
        await refreshAfterFinancialSuccess(contractId);
        return true;
      } catch (cause) {
        setRenewalCashMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [refreshAfterFinancialSuccess],
  );

  const generateLink = useCallback(
    async (contractId: string) => {
      setLinkMutation({ pending: true, error: null });
      try {
        const link = await generateReconciliationLink(contractId);
        issuedLinkByContractId.set(contractId, link);
        setIssuedLink(link);
        setLinkMutation(idleMutation());
        await afterMutation(contractId);
        return true;
      } catch (cause) {
        setLinkMutation({ pending: false, error: normalizeApiError(cause) });
        return false;
      }
    },
    [afterMutation],
  );

  return {
    data,
    status,
    error,
    issuedLink,
    lineMutation,
    roadLiabilityMutation,
    finalizeMutation,
    cashMutation,
    renewalCashMutation,
    linkMutation,
    load,
    refresh,
    clear,
    clearIssuedLink: () => {
      if (data?.contract.contractId) {
        issuedLinkByContractId.delete(data.contract.contractId);
      }
      setIssuedLink(null);
    },
    clearMutationErrors: () => {
      setLineMutation(idleMutation());
      setRoadLiabilityMutation(idleMutation());
      setFinalizeMutation(idleMutation());
      setCashMutation(idleMutation());
      setRenewalCashMutation(idleMutation());
      setLinkMutation(idleMutation());
    },
    addDamageLine,
    updateDamageLine,
    deleteDamageLine,
    addFuelLine,
    updateFuelLine,
    deleteFuelLine,
    confirmRoadLiability,
    finalize,
    settleCash,
    settleRenewalCash,
    generateLink,
  };
}
