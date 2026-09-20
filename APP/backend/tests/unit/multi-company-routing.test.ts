import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTarsProvider,
  lastTarsProviderCompanyCode,
  setTarsProviderForTests,
} from "src/modules/integrations/tars/tars.provider";
import { getTarsConfig } from "src/modules/integrations/tars/tars.config";
import { officialContractCompany } from "src/modules/contracts/official-contract";
import {
  CreateVehicleSchema,
  UpdateVehicleSchema,
} from "src/modules/vehicles/vehicles.schema";
import { assertFieldUnchanged, DomainErrorReason } from "src/lib/master-data/code";
import { AppError } from "src/lib/errors/app-error";

const UNIQUE = {
  code: "UNIQUE",
  displayName: "UNIQUE",
  legalNameAr: "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و",
  legalNameEn: "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C",
  accentColor: "#C9A15C",
};
const ELITE = {
  code: "ELITE",
  displayName: "ELITE",
  legalNameAr: "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و",
  legalNameEn: "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C",
  accentColor: "#3E5C76",
};

describe("TARS provider routing", () => {
  test("resolution is per company and both routes stay unconfigured", () => {
    setTarsProviderForTests(undefined);

    const unique = createTarsProvider("UNIQUE");
    assert.equal(lastTarsProviderCompanyCode(), "UNIQUE");
    assert.equal(unique.configured, false);
    assert.equal(unique.name, "none");

    const elite = createTarsProvider("ELITE");
    assert.equal(lastTarsProviderCompanyCode(), "ELITE");
    assert.equal(elite.configured, false);
  });

  test("configuration is resolved per company and carries no credentials", () => {
    const config = getTarsConfig("ELITE");
    assert.equal(config.companyCode, "ELITE");
    assert.deepEqual(Object.keys(config).sort(), ["companyCode", "enabled"]);
  });
});

describe("official contract company resolution", () => {
  test("a snapshot frozen with a company keeps that identity", () => {
    const frozen = { header: { officeDisplayName: "Diamond Rent Car", company: ELITE } };
    assert.deepEqual(officialContractCompany(frozen, UNIQUE), ELITE);
  });

  test("a legacy snapshot without a company block falls back to the live company", () => {
    const legacy = { header: { officeDisplayName: "Diamond Rent Car" } };
    assert.deepEqual(officialContractCompany(legacy, UNIQUE), UNIQUE);
    assert.deepEqual(officialContractCompany({}, UNIQUE), UNIQUE);
    assert.deepEqual(officialContractCompany(null, UNIQUE), UNIQUE);
  });

  test("a malformed company block is ignored rather than printed", () => {
    const broken = { header: { company: { code: "" } } };
    assert.deepEqual(officialContractCompany(broken, UNIQUE), UNIQUE);
  });
});

describe("vehicle company write-once rule", () => {
  test("create requires a company", () => {
    assert.equal(
      CreateVehicleSchema.safeParse({ vehicleName: "Civic", companyId: 2 }).success,
      true,
    );
    assert.equal(CreateVehicleSchema.safeParse({ vehicleName: "Civic" }).success, false);
  });

  test("the update schema still parses companyId so the service can reject it", () => {
    // Dropping the key would let an old client's transfer attempt be stripped
    // silently and answered with a misleading 200.
    const parsed = UpdateVehicleSchema.parse({ companyId: 7, dailyRate: 100 });
    assert.equal(parsed.companyId, 7);
  });

  test("a changed company is a 422 immutable_field, an equal one is a no-op", () => {
    assert.throws(
      () => assertFieldUnchanged("companyId", 1, 2),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 422);
        assert.equal(err.context?.field, "companyId");
        assert.equal(err.context?.reason, DomainErrorReason.IMMUTABLE_FIELD);
        return true;
      },
    );
    assert.doesNotThrow(() => assertFieldUnchanged("companyId", 1, 1));
    assert.doesNotThrow(() => assertFieldUnchanged("companyId", 1, undefined));
  });
});
