"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/config/env";
import { getSignedContractSignature } from "../api/contracts.api";
import type { OfficialContractView, OfficialSignatureSlot } from "@/modules/public-rental/types/official-contract.types";

const LEGAL_SLOTS = ["hirer", "additionalDriver", "sponsor"] as const;
const SLOT_PATHS = { hirer: "hirer", additionalDriver: "additional-driver", sponsor: "sponsor" } as const;

/**
 * Object URLs for the stored signature images of a signed contract.
 * `vehicleOutSignaturePath` (the Car-Out handover signature stream) adds the
 * hirer OUT signature for the live contract view.
 */
export function useSignedContractSignatures(contractId: string, contract: OfficialContractView | null, vehicleOutSignaturePath?: string | null) {
  const { data: session } = useSession();
  const [urls, setUrls] = useState<Partial<Record<OfficialSignatureSlot, string>>>({});

  useEffect(() => {
    const accessToken = session?.accessToken;
    if (!contract || !accessToken) return;
    let active = true;
    const created: string[] = [];
    const keep = (slot: OfficialSignatureSlot, blob: Blob) => {
      if (!active) return;
      const url = URL.createObjectURL(blob);
      created.push(url);
      setUrls((current) => ({ ...current, [slot]: url }));
    };
    void Promise.all(LEGAL_SLOTS.filter((slot) => contract.signatures[slot].hasImage).map(async (slot) => {
      try {
        keep(slot, await getSignedContractSignature(contractId, SLOT_PATHS[slot], accessToken));
      } catch { /* The signed status remains visible if an image cannot load. */ }
    }));
    if (vehicleOutSignaturePath && contract.signatures.vehicleOutHirer.hasImage) {
      const url = vehicleOutSignaturePath.startsWith("http") ? vehicleOutSignaturePath : `${env.apiUrl}${vehicleOutSignaturePath}`;
      void fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" })
        .then(async (response) => { if (response.ok) keep("vehicleOutHirer", await response.blob()); })
        .catch(() => { /* Same as above: the signed status still shows. */ });
    }
    return () => {
      active = false;
      created.forEach((url) => URL.revokeObjectURL(url));
      setUrls({});
    };
  }, [contractId, contract, vehicleOutSignaturePath, session?.accessToken]);

  return urls;
}
