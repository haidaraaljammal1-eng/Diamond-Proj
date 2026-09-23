"use client";

import { useEffect } from "react";
import { hasPendingChanges, useOfficialContractStore } from "../stores/official-contract.store";

export function useOfficialContract(token: string, enabled: boolean) {
  const store = useOfficialContractStore();

  useEffect(() => {
    if (!enabled) return;
    void store.load(token);
    return () => {
      store.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store actions are stable
  }, [token, enabled]);

  return {
    status: store.status,
    view: store.view,
    loadError: store.loadError,
    edits: store.edits,
    damageOut: store.damageOut,
    pendingSignatures: store.pendingSignatures,
    dirty: hasPendingChanges(store),
    saveStatus: store.saveStatus,
    saveError: store.saveError,
    invalidFields: store.invalidFields,
    missingRequirements: store.missingRequirements,
    scrollTargetField: store.scrollTargetField,
    signStatus: store.signStatus,
    signError: store.signError,
    missingSignatures: store.missingSignatures,
    load: store.load,
    setEdit: store.setEdit,
    setDamageOut: store.setDamageOut,
    setSignature: store.setSignature,
    fillDevTestData: store.fillDevTestData,
    save: store.save,
    sign: store.sign,
    reset: store.reset,
  };
}
