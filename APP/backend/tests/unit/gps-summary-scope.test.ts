import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GPS_SUMMARY_PROVIDER_KEYS } from "src/modules/gps/gps.constants";
import { gpsSummaryFleetWhere } from "src/modules/gps/gps.mapper";

describe("gpsSummaryFleetWhere", () => {
  it("scopes summary to active GPS bindings on LIVE_GPS and SEVEN_STARS only", () => {
    const where = gpsSummaryFleetWhere();
    assert.equal(where.isActive, true);
    assert.deepEqual(where.gpsBinding, {
      isActive: true,
      providerKey: { in: [...GPS_SUMMARY_PROVIDER_KEYS] },
    });
    assert.deepEqual([...GPS_SUMMARY_PROVIDER_KEYS], ["LIVE_GPS", "SEVEN_STARS"]);
  });

  it("optional companyId is applied on the vehicle row", () => {
    const where = gpsSummaryFleetWhere(3);
    assert.equal(where.companyId, 3);
    assert.equal(where.isActive, true);
  });
});
