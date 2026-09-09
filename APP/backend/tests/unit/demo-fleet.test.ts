import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEMO_FLEET,
  DEMO_FLEET_EXTERNAL_ID_PREFIX,
  DEMO_FLEET_EXTERNAL_IDS,
} from "prisma/seed/demo-fleet";

describe("DEMO_FLEET fixture", () => {
  it("contains exactly 20 stable DEMO-FLEET-01..20 identifiers", () => {
    assert.equal(DEMO_FLEET.length, 20);
    assert.equal(DEMO_FLEET_EXTERNAL_IDS.length, 20);
    for (let i = 1; i <= 20; i += 1) {
      const id = `${DEMO_FLEET_EXTERNAL_ID_PREFIX}${String(i).padStart(2, "0")}`;
      assert.equal(DEMO_FLEET[i - 1]?.externalId, id);
    }
    assert.equal(new Set(DEMO_FLEET_EXTERNAL_IDS).size, 20);
  });

  it("seeds every demo vehicle as active so Fleet active=true can show them", () => {
    assert.ok(DEMO_FLEET.every((car) => car.isActive));
  });
});
