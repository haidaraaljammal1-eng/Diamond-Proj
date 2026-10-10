import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveGpsProviderAccountHealth,
  isGpsProviderAccountLocallyConfigured,
  isGpsProviderAccountSyncEnabled,
} from "src/modules/gps/gps-provider-account.semantics";

describe("gps provider account semantics", () => {
  it("separates configured, enabled, and health", () => {
    const base = {
      providerKey: "LIVE_GPS",
      secretEncrypted: "cipher",
      lastSuccessfulSyncAt: null,
      lastFailureCode: "AUTH_FAILED",
    };
    assert.equal(isGpsProviderAccountLocallyConfigured({ ...base, enabled: false }), true);
    assert.equal(isGpsProviderAccountSyncEnabled({ enabled: false }), false);
    assert.equal(deriveGpsProviderAccountHealth({ ...base, enabled: false }), "DISABLED");
    assert.equal(deriveGpsProviderAccountHealth({ ...base, enabled: true }), null);
    assert.equal(
      deriveGpsProviderAccountHealth({
        providerKey: "LIVE_GPS",
        enabled: true,
        secretEncrypted: null,
        lastSuccessfulSyncAt: null,
        lastFailureCode: null,
      }),
      "NOT_CONFIGURED",
    );
  });

  it("does not treat lastFailureCode as structural invalidity", () => {
    const health = deriveGpsProviderAccountHealth({
      providerKey: "LIVE_GPS",
      enabled: true,
      secretEncrypted: "x",
      lastSuccessfulSyncAt: null,
      lastFailureCode: "SYNC_ERROR",
    });
    assert.equal(health, null);
  });
});
