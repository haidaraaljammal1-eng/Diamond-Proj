"use client";

import { useEffect } from "react";
import { usePublicRentalStore } from "../stores/public-rental.store";

export function usePublicRental(token: string) {
  const store = usePublicRentalStore();

  useEffect(() => {
    void store.load(token);
    return () => {
      store.reset();
    };
    // token is the only route credential; reload when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store actions are stable
  }, [token]);

  return {
    context: store.context,
    status: store.status,
    error: store.error,
    uploadPending: store.uploadPending,
    formPending: store.formPending,
    acceptPending: store.acceptPending,
    payPending: store.payPending,
    statusPending: store.statusPending,
    paymentStatus: store.paymentStatus,
    linkExpiredDuringPayment: store.linkExpiredDuringPayment,
    load: store.load,
    uploadLicense: store.uploadLicense,
    submitForm: store.submitForm,
    accept: store.accept,
    startPayment: store.startPayment,
    refreshPaymentStatus: store.refreshPaymentStatus,
  };
}
