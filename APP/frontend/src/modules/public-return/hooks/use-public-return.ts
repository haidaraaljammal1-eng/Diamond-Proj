"use client";

import { useEffect } from "react";
import { usePublicReturnStore } from "../stores/public-return.store";

export function usePublicReturn(token: string) {
  const store = usePublicReturnStore();

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
    load: store.load,
    confirming: store.confirming,
    confirmError: store.confirmError,
    confirm: store.confirm,
  };
}
