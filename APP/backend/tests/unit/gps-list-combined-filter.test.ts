import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { trackingStatusWhere } from "src/modules/gps/gps.mapper";
import type { GpsTrackingStatusDto } from "src/modules/gps/gps.constants";

const CONNECTIVITY_CUTOFF = new Date("2026-09-10T11:45:00.000Z");
const MOTION_CUTOFF = new Date("2026-09-10T11:50:00.000Z");

const MOVING_THRESHOLD_KPH = 3;

function composeVehicleListWhere(input: {
  providerKey?: "SEVEN_STARS" | "LIVE_GPS";
  trackingStatus?: GpsTrackingStatusDto;
  companyId?: number;
  status?: "AVAILABLE";
}): Prisma.VehicleWhereInput {
  return {
    isActive: true,
    gpsBinding: {
      isActive: true,
      ...(input.providerKey
        ? { providerAccount: { providerKey: input.providerKey } }
        : {}),
    },
    ...(input.companyId != null ? { companyId: input.companyId } : {}),
    ...(input.status ? { operationalStatus: input.status } : {}),
    ...(input.trackingStatus
      ? trackingStatusWhere(
          input.trackingStatus,
          true,
          CONNECTIVITY_CUTOFF,
          MOTION_CUTOFF,
          MOVING_THRESHOLD_KPH,
        )
      : {}),
  };
}

describe("GPS list combined provider + tracking where", () => {
  const trackingStatuses: GpsTrackingStatusDto[] = [
    "moving",
    "idle",
    "parked",
    "offline",
    "no_data",
    "online",
  ];

  for (const trackingStatus of trackingStatuses) {
    it(`preserves providerKey with trackingStatus=${trackingStatus}`, () => {
      const seven = composeVehicleListWhere({
        providerKey: "SEVEN_STARS",
        trackingStatus,
      });
      const live = composeVehicleListWhere({
        providerKey: "LIVE_GPS",
        trackingStatus,
      });

      const sevenBinding = seven.gpsBinding;
      const liveBinding = live.gpsBinding;
      assert.ok(sevenBinding && typeof sevenBinding === "object" && !Array.isArray(sevenBinding));
      assert.ok(liveBinding && typeof liveBinding === "object" && !Array.isArray(liveBinding));
      assert.equal(sevenBinding.providerAccount?.providerKey, "SEVEN_STARS");
      assert.equal(liveBinding.providerAccount?.providerKey, "LIVE_GPS");
      assert.notDeepEqual(sevenBinding, liveBinding);
    });
  }

  it("preserves provider-only binding when tracking filter is absent", () => {
    const where = composeVehicleListWhere({ providerKey: "SEVEN_STARS" });
    const binding = where.gpsBinding;
    assert.ok(binding && typeof binding === "object" && !Array.isArray(binding));
    assert.equal(binding.providerAccount?.providerKey, "SEVEN_STARS");
    assert.equal(where.gpsLatestState, undefined);
  });

  it("preserves operational status alongside provider and tracking", () => {
    const where = composeVehicleListWhere({
      providerKey: "LIVE_GPS",
      trackingStatus: "offline",
      status: "AVAILABLE",
      companyId: 2,
    });
    const binding = where.gpsBinding;
    assert.ok(binding && typeof binding === "object" && !Array.isArray(binding));
    assert.equal(binding.providerAccount?.providerKey, "LIVE_GPS");
    assert.equal(where.operationalStatus, "AVAILABLE");
    assert.equal(where.companyId, 2);
    assert.ok(where.gpsLatestState);
  });
});
