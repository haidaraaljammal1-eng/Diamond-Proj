"use client";

import { useEffect } from "react";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useContractTarsStore } from "../stores/contract-tars.store";
import type { ContractTarsLoadStatus } from "../stores/contract-tars.store";
import type { ContractTarsStateDto } from "../types/tars.types";

export interface UseContractTarsResult {
  tars: ContractTarsStateDto | null;
  status: ContractTarsLoadStatus;
  error: ApiRequestError | null;
}

/**
 * Read-only TARS integration state for one Contract.
 *
 * Fetches once when the contract id appears or changes; the store caches the
 * result, so several indicators on the same contract share one request. There
 * is no polling and no execute/retry capability.
 */
export function useContractTars(contractId: string | null): UseContractTarsResult {
  const loadedId = useContractTarsStore((state) => state.contractId);
  const state = useContractTarsStore((state) => state.state);
  const status = useContractTarsStore((state) => state.status);
  const error = useContractTarsStore((state) => state.error);
  const load = useContractTarsStore((state) => state.load);

  useEffect(() => {
    if (contractId) void load(contractId);
  }, [contractId, load]);

  const isCurrent = contractId != null && loadedId === contractId;

  return {
    tars: isCurrent ? state : null,
    status: isCurrent ? status : "loading",
    error: isCurrent ? error : null,
  };
}
