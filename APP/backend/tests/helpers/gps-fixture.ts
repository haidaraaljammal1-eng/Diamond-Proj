import type { PrismaClient } from "@prisma/client";
import { encryptSecretBlob } from "src/modules/integrations/secret-blob";
import { createGpsBindingService } from "src/modules/gps/gps-binding.service";

export async function createGpsProviderAccountFixture(
  prisma: PrismaClient,
  input: {
    providerKey: string;
    accountKey: string;
    displayName: string;
    enabled?: boolean;
    companyScopeId?: number | null;
    withCredentials?: boolean;
  },
) {
  return prisma.gpsProviderAccount.create({
    data: {
      providerKey: input.providerKey,
      accountKey: input.accountKey,
      displayName: input.displayName,
      enabled: input.enabled ?? true,
      companyScopeId: input.companyScopeId ?? null,
      secretEncrypted: input.withCredentials
        ? encryptSecretBlob({ username: "fixture-user", password: "fixture-pass" })
        : null,
    },
  });
}

export async function assignVehicleGpsBindingFixture(
  prisma: PrismaClient,
  input: {
    vehicleId: number;
    providerAccountId: string;
    externalDeviceId: string;
  },
) {
  const bindings = createGpsBindingService(prisma);
  return bindings.assignBinding({
    vehicleId: input.vehicleId,
    providerAccountId: input.providerAccountId,
    externalDeviceId: input.externalDeviceId,
  });
}
