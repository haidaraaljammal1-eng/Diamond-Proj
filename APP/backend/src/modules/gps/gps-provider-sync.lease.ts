import type { PrismaClient } from "@prisma/client";
import { GPS_PROVIDER_SYNC_LEASE_TTL_MS } from "src/modules/gps/gps-provider-sync.constants";

export async function tryAcquireGpsProviderSyncLease(
  prisma: PrismaClient,
  input: { accountId: string; ownerToken: string; ttlMs?: number },
): Promise<boolean> {
  const ttlMs = input.ttlMs ?? GPS_PROVIDER_SYNC_LEASE_TTL_MS;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE gps_provider_accounts
    SET
      "syncLeaseOwner" = ${input.ownerToken},
      "syncLeaseExpiresAt" = NOW() + (${ttlMs}::double precision / 1000.0) * interval '1 second'
    WHERE id = ${input.accountId}
      AND (
        "syncLeaseExpiresAt" IS NULL
        OR "syncLeaseExpiresAt" < NOW()
      )
    RETURNING id
  `;
  return rows.length > 0;
}

export async function releaseGpsProviderSyncLease(
  prisma: PrismaClient,
  input: { accountId: string; ownerToken: string },
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE gps_provider_accounts
    SET
      "syncLeaseOwner" = NULL,
      "syncLeaseExpiresAt" = NULL
    WHERE id = ${input.accountId}
      AND "syncLeaseOwner" = ${input.ownerToken}
    RETURNING id
  `;
  return rows.length > 0;
}
