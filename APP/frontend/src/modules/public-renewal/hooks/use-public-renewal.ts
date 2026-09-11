"use client";

import { useEffect } from "react";
import { usePublicRenewalStore } from "../stores/public-renewal.store";

export function usePublicRenewal(token: string) {
  const store = usePublicRenewalStore();

  useEffect(() => {
    void store.load(token);
    return () => {
      store.reset();
    };
    // token is the only route credential; reload when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store actions are stable
  }, [token]);

  return {
    view: store.view,
    status: store.status,
    error: store.error,
    confirmPending: store.confirmPending,
    payPending: store.payPending,
    statusPending: store.statusPending,
    paymentStatus: store.paymentStatus,
    load: store.load,
    confirm: store.confirm,
    startPayment: store.startPayment,
    refreshPaymentStatus: store.refreshPaymentStatus,
  };
}
