import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTarsProvider,
  lastTarsProviderCompanyCode,
  setTarsProviderForTests,
} from "src/modules/integrations/tars/tars.provider";
import { getTarsConfig } from "src/modules/integrations/tars/tars.config";
import { officialContractCompany } from "src/modules/contracts/official-contract";

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
