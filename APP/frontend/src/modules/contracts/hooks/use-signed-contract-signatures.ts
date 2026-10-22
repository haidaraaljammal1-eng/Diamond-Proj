"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/config/env";
import { getSignedContractSignature } from "../api/contracts.api";
import type { OfficialContractView, OfficialSignatureSlot } from "@/modules/public-rental/types/official-contract.types";

const LEGAL_SLOTS = ["hirer", "additionalDriver", "sponsor"] as const;
const SLOT_PATHS = { hirer: "hirer", additionalDriver: "additional-driver", sponsor: "sponsor" } as const;

const CUSTODY_HIRER_SLOTS = ["vehicleOutHirer", "vehicleInHirer"] as const;

export type CustodyHirerSignaturePaths = Partial<
  Record<(typeof CUSTODY_HIRER_SLOTS)[number], string | null | undefined>
>;

async function fetchCustodySignatureBlob(path: string, accessToken: string): Promise<Blob | null> {
  const url = path.startsWith("http") ? path : `${env.apiUrl}${path}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  return response.ok ? response.blob() : null;
}

/**
 * Object URLs for the stored signature images of a signed contract.
 * Optional `custodyHirerPaths` loads authenticated Car-Out / Car-In hirer streams for the live view.
 */
export function useSignedContractSignatures(
  contractId: string,
  contract: OfficialContractView | null,
  custodyHirerPaths?: CustodyHirerSignaturePaths | null,
) {
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
    void Promise.all(
      LEGAL_SLOTS.filter((slot) => contract.signatures[slot].hasImage).map(async (slot) => {
        try {
          keep(slot, await getSignedContractSignature(contractId, SLOT_PATHS[slot], accessToken));
        } catch {
          /* The signed status remains visible if an image cannot load. */
        }
      }),
    );
    void Promise.all(
      CUSTODY_HIRER_SLOTS.map(async (slot) => {
        const path = custodyHirerPaths?.[slot];
        if (!path || !contract.signatures[slot].hasImage) return;
        try {
          const blob = await fetchCustodySignatureBlob(path, accessToken);
          if (blob) keep(slot, blob);
        } catch {
          /* Same as above: the signed status still shows. */
        }
      }),
    );
    return () => {
      active = false;
      created.forEach((url) => URL.revokeObjectURL(url));
      setUrls({});
    };
  }, [contractId, contract, custodyHirerPaths, session?.accessToken]);

  return urls;
}
