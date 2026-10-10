import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isGpsProviderConfigured } from "src/modules/gps/gps-provider-configured";
import {
  getGpsProviderTestOverride,
  setGpsProviderForTests,
} from "src/modules/gps/gps.provider";
describe("isGpsProviderConfigured", () => {
  beforeEach(() => {
    setGpsProviderForTests(undefined);
  });

  it("honors test override when set", async () => {
    setGpsProviderForTests({ name: "test", configured: false });
    const prisma = {
      gpsProviderAccount: { findMany: async () => [{ providerKey: "LIVE_GPS", secretEncrypted: "x", enabled: false }] },
    };
    assert.equal(await isGpsProviderConfigured(prisma as never), false);
    setGpsProviderForTests({ name: "test", configured: true });
    assert.equal(await isGpsProviderConfigured(prisma as never), true);
    assert.ok(getGpsProviderTestOverride());
  });

  it("returns true for supported locally configured account even when disabled", async () => {
    const prisma = {
      gpsProviderAccount: {
        findMany: async () => [
          {
            providerKey: "LIVE_GPS",
            secretEncrypted: "cipher",
            enabled: false,
          },
        ],
      },
    };
    assert.equal(await isGpsProviderConfigured(prisma as never), true);
  });

  it("returns false when no locally configured supported account", async () => {
    const prisma = {
      gpsProviderAccount: {
        findMany: async () => [
          { providerKey: "LIVE_GPS", secretEncrypted: null, enabled: true },
          { providerKey: "none", secretEncrypted: "x", enabled: true },
        ],
      },
    };
    assert.equal(await isGpsProviderConfigured(prisma as never), false);
  });
});
