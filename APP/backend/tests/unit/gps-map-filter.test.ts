import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapPointsVehicleWhere } from "src/modules/gps/gps.mapper";

const CUTOFF = new Date("2026-09-10T11:50:00.000Z");
const MOVING_THRESHOLD_KPH = 3;

describe("GPS map-points where", () => {
  for (const trackingStatus of ["moving", "idle", "parked"] as const) {
    it(`preserves providerKey with trackingStatus=${trackingStatus}`, () => {
      const seven = mapPointsVehicleWhere({
        providerKey: "SEVEN_STARS",
        trackingStatus,
        cutoff: CUTOFF,
        movingThresholdKph: MOVING_THRESHOLD_KPH,
      });
      const live = mapPointsVehicleWhere({
        providerKey: "LIVE_GPS",
        trackingStatus,
        cutoff: CUTOFF,
        movingThresholdKph: MOVING_THRESHOLD_KPH,
      });
      const sevenBinding = seven.gpsBinding;
      const liveBinding = live.gpsBinding;
      assert.ok(sevenBinding && typeof sevenBinding === "object");
      assert.ok(liveBinding && typeof liveBinding === "object");
      assert.equal(sevenBinding.providerAccount?.providerKey, "SEVEN_STARS");
      assert.equal(liveBinding.providerAccount?.providerKey, "LIVE_GPS");
      assert.notDeepEqual(sevenBinding, liveBinding);
      if (trackingStatus === "parked") {
        assert.deepEqual(seven.gpsLatestState, { isNot: null });
      } else {
        assert.ok(seven.gpsLatestState && "is" in seven.gpsLatestState);
      }
    });
  }

  it("preserves company + provider + tracking together", () => {
    const where = mapPointsVehicleWhere({
      providerKey: "LIVE_GPS",
      companyId: 2,
      trackingStatus: "idle",
      cutoff: CUTOFF,
      movingThresholdKph: MOVING_THRESHOLD_KPH,
    });
    const binding = where.gpsBinding;
    assert.ok(binding && typeof binding === "object");
    assert.equal(binding.providerAccount?.providerKey, "LIVE_GPS");
    assert.equal(where.companyId, 2);
    assert.ok(where.gpsLatestState && "is" in where.gpsLatestState);
  });

  it("omits tracking clause when trackingStatus is absent", () => {
    const where = mapPointsVehicleWhere({
      providerKey: "SEVEN_STARS",
      cutoff: CUTOFF,
      movingThresholdKph: MOVING_THRESHOLD_KPH,
    });
    assert.equal(where.NOT, undefined);
    assert.deepEqual(where.gpsLatestState, { isNot: null });
  });

  it("parked map filter still requires a latest-state row (no fake coordinates)", () => {
    const parked = mapPointsVehicleWhere({
      trackingStatus: "parked",
      cutoff: CUTOFF,
      movingThresholdKph: MOVING_THRESHOLD_KPH,
    });
    assert.ok(parked.NOT);
    assert.deepEqual(parked.gpsLatestState, { isNot: null });
  });
});
