import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mapLiveGpsFleetRow } from "src/modules/gps/providers/live-gps/live-gps.mapper";
import { mapLiveGpsHistoryRow } from "src/modules/gps/providers/live-gps/live-gps.history.mapper";
import { buildLiveGpsSourceEventId } from "src/modules/gps/providers/live-gps/live-gps.source-event";
import {
  formatLiveGpsLocalDateTime,
  parseLiveGpsDisplayDateTime,
  parseLiveGpsLocalDateTime,
  resolveLiveGpsTimezoneOffset,
} from "src/modules/gps/providers/live-gps/live-gps.time";
import {
  SANITIZED_FLEET_ROW,
  SANITIZED_FLEET_ROW_RUNNING,
  SANITIZED_HISTORY_ROW,
} from "tests/fixtures/live-gps-sanitized";

describe("Live GPS time parser", () => {
  it("parses ISO local with offset to UTC", () => {
    const d = parseLiveGpsLocalDateTime("2026-10-08T20:20:46", "+04:00");
    assert.ok(d);
    assert.equal(d!.toISOString(), "2026-10-08T16:20:46.000Z");
  });

  it("parses display datetime with PM", () => {
    const d = parseLiveGpsDisplayDateTime("08-Oct-2026 08:20:46 PM", "+04:00");
    assert.ok(d);
    assert.equal(d!.toISOString(), "2026-10-08T16:20:46.000Z");
  });

  it("formats UTC as the exact UAE provider-local history minute", () => {
    assert.equal(
      formatLiveGpsLocalDateTime(new Date("2026-10-08T16:20:46.000Z"), "+04:00"),
      "2026-10-08 20:20",
    );
  });

  it("resolves configured and fallback offsets consistently", () => {
    assert.equal(resolveLiveGpsTimezoneOffset({ timezoneOffset: "+04:00" }), "+04:00");
    assert.equal(resolveLiveGpsTimezoneOffset({ timezoneOffset: "+03:00" }), "+03:00");
    assert.equal(resolveLiveGpsTimezoneOffset({ timezoneOffset: "-05:00" }), "-05:00");
    assert.equal(resolveLiveGpsTimezoneOffset(null), "+04:00");
    assert.equal(resolveLiveGpsTimezoneOffset({ timezoneOffset: "UTC" }), "+04:00");
  });
});

describe("Live GPS sourceEventId", () => {
  const base = {
    providerAccountId: "acc-1",
    externalDeviceId: "1001",
    capturedAt: new Date("2026-10-08T16:20:46.000Z"),
    latitude: 25.1,
    longitude: 55.2,
  };

  it("is deterministic and sensitive to changes", () => {
    const a = buildLiveGpsSourceEventId(base);
    const b = buildLiveGpsSourceEventId(base);
    assert.equal(a, b);
    assert.notEqual(
      a,
      buildLiveGpsSourceEventId({ ...base, latitude: 25.1000001 }),
    );
  });
});

describe("Live GPS fleet mapper", () => {
  it("maps verified fields and discards driver PII", () => {
    const snap = mapLiveGpsFleetRow(SANITIZED_FLEET_ROW, {
      providerAccountId: "acc-1",
      defaultOffset: "+04:00",
      receivedAt: new Date(),
    });
    assert.ok(snap);
    assert.equal(snap!.externalDeviceId, "1001");
    assert.equal(snap!.deviceMetadata.externalDeviceUid, "IMEI-SYNTH-001");
    assert.equal(snap!.telemetry?.speedKph, 0);
    assert.equal(snap!.telemetry?.odometerValue, 123456.78);
    assert.equal(snap!.telemetry?.distanceTodayValue, 99.5);
    assert.equal(snap!.telemetry?.providerDeviceState, "Stop");
    assert.equal(snap!.telemetry?.ignitionOn, false);
    assert.equal(snap!.telemetry?.providerExtras?.rawActIgnition, 0);
    assert.equal(snap!.telemetry?.providerExtras?.rawIgnition, undefined);
    assert.equal(snap!.telemetry?.parkingEnabled, true);
    assert.equal(snap!.telemetry?.satelliteCount, 12);
    assert.equal(snap!.telemetry?.providerExtras?.rawActSpeed, 0);
    assert.equal("drivername" in (snap!.telemetry?.providerExtras ?? {}), false);
  });

  it("maps Running row ign to ignitionOn; actign stays extras only", () => {
    const snap = mapLiveGpsFleetRow(SANITIZED_FLEET_ROW_RUNNING, {
      providerAccountId: "acc-1",
      defaultOffset: "+04:00",
      receivedAt: new Date(),
    });
    assert.ok(snap?.telemetry);
    assert.equal(snap!.telemetry!.ignitionOn, true);
    assert.equal(snap!.telemetry!.providerDeviceState, "Running");
    assert.ok((snap!.telemetry!.speedKph ?? 0) > 0);
    assert.equal(snap!.telemetry!.providerExtras?.rawActIgnition, 1);
    assert.equal(snap!.telemetry!.providerExtras?.rawIgnition, undefined);
    assert.equal(snap!.telemetry!.providerExtras?.rawActSpeed, 25.35);
    assert.equal(snap!.telemetry!.providerExtras?.rawMotion, true);
    assert.equal(snap!.telemetry!.providerExtras?.rawActMotion, 1);
  });

  it("does not derive ignitionOn from actign when ign is absent", () => {
    const row = { ...SANITIZED_FLEET_ROW, ign: undefined, actign: 1 };
    const snap = mapLiveGpsFleetRow(row, {
      providerAccountId: "acc-1",
      defaultOffset: "+04:00",
      receivedAt: new Date(),
    });
    assert.equal(snap?.telemetry?.ignitionOn, null);
    assert.equal(snap?.telemetry?.providerExtras?.rawActIgnition, 1);
  });
});

describe("Live GPS history mapper", () => {
  it("keeps history meter as segment meters and speed as km/h", () => {
    const point = mapLiveGpsHistoryRow(SANITIZED_HISTORY_ROW, {
      timezoneOffset: "+04:00",
      externalDeviceId: "1001",
    });
    assert.ok(point);
    assert.equal(point!.capturedAt.toISOString(), "2026-10-01T16:38:47.000Z");
    assert.equal(point!.segmentDistanceMeters, 592.6);
    assert.equal(point!.speedKph, 97);
    assert.equal("sourceEventId" in point!, false);
    assert.equal("externalDeviceId" in point!, false);
  });

  it("rejects rows for a provider device other than the resolved binding", () => {
    const point = mapLiveGpsHistoryRow(
      { ...SANITIZED_HISTORY_ROW, deviceid: "different-device" },
      {
        timezoneOffset: "+04:00",
        externalDeviceId: "1001",
      },
    );
    assert.equal(point, null);
  });

  it("uses the explicit provider-local parser instead of generic Date parsing", () => {
    const source = readFileSync(
      path.join(
        __dirname,
        "../../../src/modules/gps/providers/live-gps/live-gps.history.mapper.ts",
      ),
      "utf8",
    );
    assert.ok(source.includes("parseLiveGpsLocalDateTime"));
    assert.equal(source.includes("new Date("), false);
    assert.equal(source.includes("Date.parse("), false);
  });
});
