import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRoadChargeReferenceNumber,
  roadLiabilityTypeToChargeCategory,
} from "src/modules/road-liabilities/road-charge-reference.normalize";

describe("road charge reference normalization", () => {
  test("trims surrounding whitespace and preserves leading zeros", () => {
    assert.equal(normalizeRoadChargeReferenceNumber("  000123  "), "000123");
  });

  test("maps liability types to staff charge categories", () => {
    assert.equal(roadLiabilityTypeToChargeCategory("RTA_VIOLATION"), "TRAFFIC_VIOLATION");
    assert.equal(roadLiabilityTypeToChargeCategory("SALIK_TOLL"), "SALIK");
    assert.equal(roadLiabilityTypeToChargeCategory("SALIK_VIOLATION"), "SALIK");
  });
});
