"use client";

import { useCallback, useState } from "react";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getPublicReconciliation, startPublicReconciliationPayment } from "@/modules/contracts/api/reconciliation.api";
import type { PublicReconciliationReadDto } from "@/modules/contracts/types/reconciliation.types";

type LoadStatus = "idle" | "loading" | "ready" | "error";

export function usePublicReconciliation(token: string) {
  const [data, setData] = useState<PublicReconciliationReadDto | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [payPending, setPayPending] = useState(false);
  const [payError, setPayError] = useState<ApiRequestError | null>(null);

  const load = useCallback(async (value: string) => {
    setStatus("loading");
    setError(null);
    try {
      const next = await getPublicReconciliation(value);
      setData(next);
      setStatus("ready");
    } catch (cause) {
      setData(null);
      setStatus("error");
      setError(normalizeApiError(cause));
    }
  }, []);

  const continueToPayment = useCallback(async (value: string) => {
    setPayPending(true);
    setPayError(null);
    try {
      const checkout = await startPublicReconciliationPayment(value);
      const url = checkout.checkoutUrl ?? checkout.payment.checkoutUrl ?? null;
      if (url && typeof window !== "undefined") {
        window.location.assign(url);
        return true;
      }
      setPayError(
        normalizeApiError(new Error("Missing checkout URL")),
      );
      return false;
    } catch (cause) {
      setPayError(normalizeApiError(cause));
      return false;
    } finally {
      setPayPending(false);
    }
  }, []);

  return { data, status, error, payPending, payError, load, continueToPayment };
}
