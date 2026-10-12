import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSevenStarsLivePublisher } from "src/modules/gps/providers/seven-stars/seven-stars-live.publisher";

describe("Seven Stars live publisher", () => {
  it("publishes sanitized events and removes listeners on unsubscribe", () => {
    const publisher = getSevenStarsLivePublisher();
    const received: number[] = [];
    const unsubscribe = publisher.subscribe((event) => received.push(event.vehicleId));
    publisher.publish({
      providerKey: "SEVEN_STARS",
      providerAccountId: "account",
      vehicleId: 42,
      latitude: 25,
      longitude: 55,
      speedKph: 10,
      headingDegrees: 90,
      ignitionOn: true,
      motionState: "MOVING",
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    unsubscribe();
    publisher.publish({
      providerKey: "SEVEN_STARS",
      providerAccountId: "account",
      vehicleId: 43,
      latitude: 25,
      longitude: 55,
      speedKph: null,
      headingDegrees: null,
      ignitionOn: null,
      motionState: "UNKNOWN",
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    assert.deepEqual(received, [42]);
  });
});
