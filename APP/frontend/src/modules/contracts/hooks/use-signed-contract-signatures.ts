"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getSignedContractSignature } from "../api/contracts.api";
import type { OfficialContractView, OfficialSignatureSlot } from "@/modules/public-rental/types/official-contract.types";

const LEGAL_SLOTS = ["hirer", "additionalDriver", "sponsor"] as const;
const SLOT_PATHS = { hirer: "hirer", additionalDriver: "additional-driver", sponsor: "sponsor" } as const;

export function useSignedContractSignatures(contractId: string, contract: OfficialContractView | null) {
  const { data: session } = useSession();
  const [urls, setUrls] = useState<Partial<Record<OfficialSignatureSlot, string>>>({});

  useEffect(() => {
    const accessToken = session?.accessToken;
    if (!contract || !accessToken) return;
    let active = true;
    const created: string[] = [];
    void Promise.all(LEGAL_SLOTS.filter((slot) => contract.signatures[slot].hasImage).map(async (slot) => {
      try {
        const blob = await getSignedContractSignature(contractId, SLOT_PATHS[slot], accessToken);
        if (!active) return;
        const url = URL.createObjectURL(blob);
        created.push(url);
        setUrls((current) => ({ ...current, [slot]: url }));
      } catch { /* The signed status remains visible if an image cannot load. */ }
    }));
    return () => {
      active = false;
      created.forEach((url) => URL.revokeObjectURL(url));
      setUrls({});
    };
  }, [contractId, contract, session?.accessToken]);

  return urls;
}
