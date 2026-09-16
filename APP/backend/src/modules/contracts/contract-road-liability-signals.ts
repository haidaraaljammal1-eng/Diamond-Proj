import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";

export type ContractRoadLiabilitySignals = {
  hasSalikGpsSignal: boolean;
  salikGpsSignalCount: number;
  unconfirmedSalikGpsSignalCount: number;
  latestSalikGpsSignalAt: Date | null;
};

export const EMPTY_ROAD_LIABILITY_SIGNALS: ContractRoadLiabilitySignals = {
  hasSalikGpsSignal: false,
  salikGpsSignalCount: 0,
  unconfirmedSalikGpsSignalCount: 0,
  latestSalikGpsSignalAt: null,
};

type Db = PrismaClient | Tx;

export type SalikGpsSignalRow = {
  attributedContractId: string | null;
  confirmationStatus: string;
  occurredAt: Date;
};

export function foldSalikGpsSignals(
  contractIds: string[],
  rows: readonly SalikGpsSignalRow[],
): Map<string, ContractRoadLiabilitySignals> {
  const map = new Map<string, ContractRoadLiabilitySignals>();
  for (const id of contractIds) {
    map.set(id, { ...EMPTY_ROAD_LIABILITY_SIGNALS });
  }
  for (const row of rows) {
    const contractId = row.attributedContractId;
    if (!contractId || !map.has(contractId)) continue;
    const current = map.get(contractId) ?? { ...EMPTY_ROAD_LIABILITY_SIGNALS };
    current.hasSalikGpsSignal = true;
    current.salikGpsSignalCount += 1;
    if (row.confirmationStatus === "PENDING_CONFIRMATION") {
      current.unconfirmedSalikGpsSignalCount += 1;
    }
    if (
      current.latestSalikGpsSignalAt == null ||
      row.occurredAt.getTime() > current.latestSalikGpsSignalAt.getTime()
    ) {
      current.latestSalikGpsSignalAt = row.occurredAt;
    }
    map.set(contractId, current);
  }
  return map;
}

/**
 * Derived GPS Salik intelligence attributed to a Contract by custody.
 * Informational only — never debt, never a Contract/Vehicle status change.
 */
export async function loadSalikGpsSignals(
  db: Db,
  contractIds: string[],
): Promise<Map<string, ContractRoadLiabilitySignals>> {
  if (contractIds.length === 0) return foldSalikGpsSignals([], []);

  const rows = await db.roadLiability.findMany({
    where: {
      attributedContractId: { in: contractIds },
      observations: { some: { sourceKey: "GPS_INFERENCE", eventType: "SALIK_TOLL" } },
    },
    select: {
      attributedContractId: true,
      confirmationStatus: true,
      occurredAt: true,
    },
  });

  return foldSalikGpsSignals(contractIds, rows);
}
