import type { Tx } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import {
  CONTRACT_NUMBER_LOCK_NS,
  CONTRACT_NUMBER_PREFIX,
} from "src/modules/contracts/contracts.constants";

export function formatContractNumber(year: number, sequence: number): string {
  return `${CONTRACT_NUMBER_PREFIX}-${year}-${String(sequence).padStart(6, "0")}`;
}

export async function allocateContractNumber(tx: Tx, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  await acquireAdvisoryLock(tx, CONTRACT_NUMBER_LOCK_NS, year);
  const row = await tx.contractNumberSequence.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return formatContractNumber(year, row.lastValue);
}
