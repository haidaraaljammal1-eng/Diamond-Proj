import { timingSafeEqual } from "node:crypto";
import type { ContractLink, ContractLinkType, PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";

type Db = PrismaClient | Tx;
import {
  expiryFromNow,
  generateOpaqueToken,
  hashToken,
  isExpired,
} from "src/lib/security/tokens";
import { CONTRACT_LINK_TTL_SECONDS } from "src/modules/contracts/contracts.constants";
import { contractError } from "src/modules/contracts/contracts.errors";

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function issueContractLink(
  tx: Db,
  input: {
    contractId: string;
    type: ContractLinkType;
    createdByUserId?: number | null;
  },
): Promise<{ token: string; expiresAt: Date; link: ContractLink }> {
  await tx.contractLink.updateMany({
    where: { contractId: input.contractId, type: input.type, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const token = generateOpaqueToken(32);
  const expiresAt = expiryFromNow(CONTRACT_LINK_TTL_SECONDS[input.type]);
  const link = await tx.contractLink.create({
    data: {
      contractId: input.contractId,
      type: input.type,
      tokenHash: hashToken(token),
      expiresAt,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
  return { token, expiresAt, link };
}

export async function resolveContractLink(
  tx: Db,
  token: string,
  type: ContractLinkType,
  options: { allowCompleted?: boolean } = {},
): Promise<ContractLink> {
  const digest = hashToken(token);
  const link = await tx.contractLink.findUnique({ where: { tokenHash: digest } });
  if (!link || !hashesEqual(link.tokenHash, digest) || link.type !== type || link.revokedAt) {
    throw contractError.linkInvalid();
  }
  if (isExpired(link.expiresAt)) throw contractError.linkExpired();
  const allowCompleted = type === "RENTAL" && options.allowCompleted;
  if (link.usedAt && !allowCompleted) throw contractError.linkUsed();
  return link;
}

export async function completeRentalLinks(tx: Db, contractId: string): Promise<void> {
  await tx.contractLink.updateMany({
    where: { contractId, type: "RENTAL", usedAt: null, revokedAt: null },
    data: { usedAt: new Date() },
  });
}

export async function markLinkUsed(tx: Db, linkId: string): Promise<void> {
  const result = await tx.contractLink.updateMany({
    where: { id: linkId, usedAt: null, revokedAt: null },
    data: { usedAt: new Date() },
  });
  if (result.count !== 1) throw contractError.linkUsed();
}
