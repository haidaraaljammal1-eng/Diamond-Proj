import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { TarsUnconfiguredProvider } from "src/modules/integrations/tars/providers/tars-unconfigured.provider";
import {
  createTarsProvider,
  lastTarsProviderCompanyCode,
  setTarsProviderForTests,
} from "src/modules/integrations/tars/tars.provider";
import { getTarsCompanyConfig } from "src/modules/integrations/tars/tars.config";
import { assertIntegrationCompanyMatch } from "src/modules/integrations/tars/tars-company.guard";
import { TARS_ERROR_REASONS } from "src/modules/integrations/tars/tars.errors";
import type { TarsProvider } from "src/modules/integrations/tars/tars.types";

describe("TARS T1 dual-provider readiness", () => {
  test("UNIQUE and ELITE have separate config namespaces", () => {
    const unique = getTarsCompanyConfig("UNIQUE");
    const elite = getTarsCompanyConfig("ELITE");
    assert.equal(unique.companyCode, "UNIQUE");
    assert.equal(elite.companyCode, "ELITE");
    assert.notEqual(unique.companyCode, elite.companyCode);
  });

  test("provider routing never falls back between companies", () => {
    setTarsProviderForTests(undefined);
    createTarsProvider("UNIQUE");
    assert.equal(lastTarsProviderCompanyCode(), "UNIQUE");
    createTarsProvider("ELITE");
    assert.equal(lastTarsProviderCompanyCode(), "ELITE");
  });

  test("UNIQUE unconfigured does not invoke ELITE semantics", async () => {
    const unique = new TarsUnconfiguredProvider("UNIQUE");
    const elite = new TarsUnconfiguredProvider("ELITE");
    assert.equal(unique.companyCode, "UNIQUE");
    assert.equal(elite.companyCode, "ELITE");
    const result = await unique.createRental({} as never);
    assert.equal(result.errorCode, TARS_ERROR_REASONS.NOT_CONFIGURED);
  });

  test("uncertain capabilities fail closed without external mutation", async () => {
    const provider = new TarsUnconfiguredProvider("UNIQUE");
    const lookup = await provider.lookupVehicle({} as never);
    const register = await provider.registerVehicleIfRequired({} as never);
    const license = await provider.inquireDrivingLicense({} as never);
    const upload = await provider.uploadAttachment({} as never);
    assert.equal(lookup.success, false);
    assert.equal(register.success, false);
    assert.equal(license.success, false);
    assert.equal(upload.success, false);
  });

  test("optional Salik/fines are not part of TarsProvider core contract", () => {
    const provider = new TarsUnconfiguredProvider("UNIQUE") as unknown as Record<string, unknown>;
    assert.equal("retrieveSalik" in provider, false);
    assert.equal("retrieveFines" in provider, false);
    assert.equal("borrowVehicle" in provider, false);
    assert.equal("createReservation" in provider, false);
  });

  test("rejects cross-company stored provider metadata", () => {
    assert.throws(
      () => assertIntegrationCompanyMatch("UNIQUE", "ELITE"),
      /TARS external identifier/,
    );
  });

  test("OTP provider methods fail closed — no fake success", async () => {
    const provider = new TarsUnconfiguredProvider("ELITE");
    const request = await provider.requestContractOtp({} as never);
    const verify = await provider.verifyContractOtp({} as never);
    assert.equal(request.success, false);
    assert.equal(verify.success, false);
  });
});
