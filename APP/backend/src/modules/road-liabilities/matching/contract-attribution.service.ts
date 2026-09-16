import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import type {
  CustodyAttribution,
  CustodyWindow,
} from "src/modules/road-liabilities/road-liability.types";

type Db = PrismaClient | Tx;

/**
 * Attribute a road event to a Contract using actual vehicle possession:
 * Car-Out.occurredAt <= event < Car-In.occurredAt (or open if no Car-In).
 *
 * Never uses currentRental, scheduled start/end, or contract status alone.
 * CLOSED historical contracts still match. Multiple windows stay AMBIGUOUS.
 */
export function attributeCustodyWindows(
  windows: CustodyWindow[],
  occurredAt: Date,
): CustodyAttribution {
  const eventMs = occurredAt.getTime();
  const matches = windows.filter((window) => {
    if (window.carOutAt.getTime() > eventMs) return false;
    if (window.carInAt && eventMs >= window.carInAt.getTime()) return false;
    return true;
  });
  if (matches.length === 0) return { status: "UNMATCHED" };
  if (matches.length === 1) return { status: "MATCHED", contractId: matches[0]!.contractId };
  return { status: "AMBIGUOUS", contractIds: matches.map((m) => m.contractId) };
}

export function createContractAttributionService(prisma: Db) {
  async function attributeByVehiclePossession(input: {
    vehicleId: number | null;
    occurredAt: Date;
  }): Promise<CustodyAttribution> {
    if (input.vehicleId == null) return { status: "UNMATCHED" };

    const contracts = await prisma.contract.findMany({
      where: {
        vehicleId: input.vehicleId,
        carOut: { isNot: null },
      },
      select: {
        id: true,
        carOut: { select: { occurredAt: true } },
        carIn: { select: { occurredAt: true } },
      },
    });

    const windows: CustodyWindow[] = [];
    for (const contract of contracts) {
      if (!contract.carOut) continue;
      windows.push({
        contractId: contract.id,
        carOutAt: contract.carOut.occurredAt,
        carInAt: contract.carIn?.occurredAt ?? null,
      });
    }
    return attributeCustodyWindows(windows, input.occurredAt);
  }

  return { attributeByVehiclePossession };
}
