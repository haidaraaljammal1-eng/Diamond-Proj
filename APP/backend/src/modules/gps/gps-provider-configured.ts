import type { PrismaClient } from "@prisma/client";
import { isGpsProviderAccountLocallyConfigured } from "src/modules/gps/gps-provider-account.semantics";
import { getGpsProviderTestOverride } from "src/modules/gps/gps.provider";

/**
 * Staff read API compatibility: `providerConfigured` on GET /gps/*.
 *
 * True when at least one supported provider account has local credentials stored.
 * Does NOT require `enabled`, health, or recent sync success.
 *
 * Test override via `setGpsProviderForTests({ configured: true|false })` takes precedence.
 *
 * @see gps-provider-account.semantics.ts for CONFIGURED / ENABLED / HEALTH separation.
 */
export async function isGpsProviderConfigured(prisma: PrismaClient): Promise<boolean> {
  const override = getGpsProviderTestOverride();
  if (override) return override.configured;

  const accounts = await prisma.gpsProviderAccount.findMany({
    select: { providerKey: true, secretEncrypted: true, enabled: true },
  });
  return accounts.some((account) =>
    isGpsProviderAccountLocallyConfigured({
      providerKey: account.providerKey,
      enabled: account.enabled,
      secretEncrypted: account.secretEncrypted,
      lastSuccessfulSyncAt: null,
      lastFailureCode: null,
    }),
  );
}
