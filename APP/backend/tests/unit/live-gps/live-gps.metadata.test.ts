import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapLiveGpsDeviceMetadata } from "src/modules/gps/providers/live-gps/live-gps.metadata";

describe("mapLiveGpsDeviceMetadata", () => {
  it("maps only the provider-neutral device model", () => {
    assert.deepEqual(
      mapLiveGpsDeviceMetadata(
        [
          {
            deviceid: "device-1",
            devicetype: "  Tracker Model  ",
            devicetypeid: "205",
            deviceimei: "sensitive-imei",
            simno: "sensitive-sim",
          },
        ],
        "device-1",
      ),
      { deviceModel: "Tracker Model" },
    );
  });

  it("returns an unavailable model for missing or unmatched metadata", () => {
    assert.deepEqual(
      mapLiveGpsDeviceMetadata([{ deviceid: "device-1" }], "device-1"),
      { deviceModel: null },
    );
    assert.deepEqual(
      mapLiveGpsDeviceMetadata([{ deviceid: "device-1", devicetype: "Model" }], "device-2"),
      { deviceModel: null },
    );
  });
});
