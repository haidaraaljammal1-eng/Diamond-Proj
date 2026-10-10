import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { AppError } from "src/lib/errors/app-error";
import {
  gpsProviderAuthFailedError,
  GpsErrorReason,
} from "src/modules/gps/gps.errors";
import {
  GPS_HISTORY_DEFAULT_RANGE_MS,
  GPS_HISTORY_MAX_POINTS,
  normalizeAndSummarizeHistory,
  resolveGpsHistoryRange,
} from "src/modules/gps/gps-history";
import { createGpsHistoryService } from "src/modules/gps/gps-history.service";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import { GPS_CAPABILITIES_NONE } from "src/modules/gps/gps-provider.capabilities";
import type {
  GpsProviderHistoryFetchContext,
  ProviderHistoryFetchResult,
} from "src/modules/gps/gps-provider.types";
import { LiveGpsSessionManager } from "src/modules/gps/providers/live-gps/live-gps.session";

const NOW = new Date("2026-10-09T12:00:00.000Z");

function reason(error: unknown): string | undefined {
  return error instanceof AppError ? (error.context?.reason as string | undefined) : undefined;
}

function historyAdapter(
  fetchResult: ProviderHistoryFetchResult | Error,
  calls: GpsProviderHistoryFetchContext[] = [],
): GpsProviderAdapter {
  return {
    providerKey: "TEST_HISTORY",
    displayName: "Test history",
    supportsFleetSync: false,
    staticCapabilities: { ...GPS_CAPABILITIES_NONE, history: true },
    async fetchHistory(ctx) {
      calls.push(ctx);
      if (fetchResult instanceof Error) throw fetchResult;
      return fetchResult;
    },
  };
}

function serviceFixture(input?: {
  binding?: boolean;
  adapter?: GpsProviderAdapter | null;
}) {
  const reads: string[] = [];
  const vehicle = input?.binding === false
    ? { id: 17, gpsBinding: null }
    : {
        id: 17,
        gpsBinding: {
          isActive: true,
          externalDeviceId: "internal-device-only",
          providerAccount: {
            id: "account-1",
            providerKey: "TEST_HISTORY",
            accountKey: "test",
            config: { timezoneOffset: "+04:00" },
            secretEncrypted: "configured-secret",
          },
        },
      };
  const prisma = new Proxy(
    {
      vehicle: {
        async findFirst() {
          reads.push("vehicle.findFirst");
          return vehicle;
        },
      },
    },
    {
      get(target, property, receiver) {
        if (property in target) return Reflect.get(target, property, receiver);
        throw new Error(`unexpected Prisma access: ${String(property)}`);
      },
    },
  );
  const fastify = {
    prisma,
    log: { info() {}, warn() {}, error() {}, debug() {} },
  } as unknown as FastifyInstance;
  const gps = createGpsHistoryService(fastify, {
    now: () => NOW,
    resolveAdapter: () => input?.adapter ?? null,
    runtime: { liveGpsSessionManager: new LiveGpsSessionManager() },
  });
  return { gps, reads };
}

describe("GPS history range policy", () => {
  it("defaults to the last 24 hours", () => {
    const range = resolveGpsHistoryRange({}, NOW);
    assert.equal(range.to.toISOString(), NOW.toISOString());
    assert.equal(range.to.getTime() - range.from.getTime(), GPS_HISTORY_DEFAULT_RANGE_MS);
  });

  it("accepts a valid custom ISO range", () => {
    const range = resolveGpsHistoryRange(
      {
        from: "2026-10-08T06:00:00.000Z",
        to: "2026-10-08T12:00:00.000Z",
      },
      NOW,
    );
    assert.equal(range.from.toISOString(), "2026-10-08T06:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-10-08T12:00:00.000Z");
  });

  it("rejects invalid, reversed, partial, future-only, and over-seven-day ranges", () => {
    for (const query of [
      { from: "not-a-date", to: NOW.toISOString() },
      { from: "2026-02-30T10:00:00.000Z", to: NOW.toISOString() },
      { from: NOW.toISOString(), to: "2026-10-09T11:00:00.000Z" },
      { from: NOW.toISOString() },
      { from: "2026-10-10T10:00:00.000Z", to: "2026-10-10T11:00:00.000Z" },
    ]) {
      assert.throws(
        () => resolveGpsHistoryRange(query, NOW),
        (error) => reason(error) === GpsErrorReason.HISTORY_INVALID_RANGE,
      );
    }
    assert.throws(
      () =>
        resolveGpsHistoryRange(
          {
            from: "2026-10-01T11:59:59.000Z",
            to: "2026-10-08T12:00:00.000Z",
          },
          NOW,
        ),
      (error) => reason(error) === GpsErrorReason.HISTORY_RANGE_TOO_LARGE,
    );
  });
});

describe("GPS history normalization", () => {
  it("sorts points and computes segment distance, duration, and maximum speed", () => {
    const normalized = normalizeAndSummarizeHistory([
      {
        capturedAt: new Date("2026-10-09T10:05:00.000Z"),
        latitude: 25.2,
        longitude: 55.2,
        speedKph: 72,
        segmentDistanceMeters: 250.5,
        addressLine: null,
      },
      {
        capturedAt: new Date("2026-10-09T10:00:00.000Z"),
        latitude: 25.1,
        longitude: 55.1,
        speedKph: 30,
        segmentDistanceMeters: 100,
        addressLine: null,
      },
    ]);
    assert.equal(normalized.points[0]!.capturedAt.toISOString(), "2026-10-09T10:00:00.000Z");
    assert.equal(normalized.summary.pointCount, 2);
    assert.equal(normalized.summary.totalDistanceMeters, 350.5);
    assert.equal(normalized.summary.durationSeconds, 300);
    assert.equal(normalized.summary.maxSpeedKph, 72);
  });
});

describe("GPS history service", () => {
  const points = [
    {
      capturedAt: new Date("2026-10-09T10:00:00.000Z"),
      latitude: 25.1,
      longitude: 55.1,
      speedKph: 40,
      segmentDistanceMeters: 120,
      addressLine: "Synthetic address",
    },
  ];

  it("resolves the active binding internally and performs a read-only adapter call", async () => {
    const calls: GpsProviderHistoryFetchContext[] = [];
    const adapter = historyAdapter(
      { points, providerRowCount: 1, invalidRowCount: 0 },
      calls,
    );
    const { gps, reads } = serviceFixture({ adapter });
    const result = await gps.getVehicleHistory(17, {
      from: "2026-10-09T09:00:00.000Z",
      to: "2026-10-09T11:00:00.000Z",
    });

    assert.deepEqual(reads, ["vehicle.findFirst"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.externalDeviceId, "internal-device-only");
    assert.equal(result.vehicleId, 17);
    assert.equal(result.summary.totalDistanceMeters, 120);
    for (const field of [
      "providerKey",
      "providerAccountId",
      "externalDeviceId",
      "deviceid",
      "IMEI",
      "SIM",
    ]) {
      assert.equal(field in result, false, field);
    }
    assert.equal("sourceEventId" in result.points[0]!, false);
  });

  it("returns safe errors for missing binding and unsupported history", async () => {
    const withoutBinding = serviceFixture({ binding: false, adapter: historyAdapter({
      points: [],
      providerRowCount: 0,
      invalidRowCount: 0,
    }) });
    await assert.rejects(
      () => withoutBinding.gps.getVehicleHistory(17, {}),
      (error) => reason(error) === GpsErrorReason.BINDING_NOT_FOUND,
    );

    const unsupported = serviceFixture({
      adapter: {
        providerKey: "TEST_HISTORY",
        displayName: "Unsupported",
        supportsFleetSync: false,
        staticCapabilities: GPS_CAPABILITIES_NONE,
      },
    });
    await assert.rejects(
      () => unsupported.gps.getVehicleHistory(17, {}),
      (error) => reason(error) === GpsErrorReason.HISTORY_UNSUPPORTED,
    );
  });

  it("preserves sanitized provider auth and invalid-response errors", async () => {
    const auth = serviceFixture({ adapter: historyAdapter(gpsProviderAuthFailedError()) });
    await assert.rejects(
      () => auth.gps.getVehicleHistory(17, {}),
      (error) => reason(error) === GpsErrorReason.PROVIDER_AUTH_FAILED,
    );

    const invalid = serviceFixture({
      adapter: historyAdapter({
        points: [],
        providerRowCount: 1,
        invalidRowCount: 1,
      }),
    });
    await assert.rejects(
      () => invalid.gps.getVehicleHistory(17, {}),
      (error) => reason(error) === GpsErrorReason.PROVIDER_INVALID_RESPONSE,
    );
  });

  it("rejects provider results above 10,000 points without truncation", async () => {
    const tooLarge = serviceFixture({
      adapter: historyAdapter({
        points: [],
        providerRowCount: GPS_HISTORY_MAX_POINTS + 1,
        invalidRowCount: 0,
      }),
    });
    await assert.rejects(
      () => tooLarge.gps.getVehicleHistory(17, {}),
      (error) => reason(error) === GpsErrorReason.HISTORY_RESULT_TOO_LARGE,
    );
  });

  it("has no ingest, observer, Salik, lease, or database-write path", () => {
    const source = readFileSync(
      path.join(__dirname, "../../src/modules/gps/gps-history.service.ts"),
      "utf8",
    );
    for (const forbidden of [
      "ingestLatestPosition",
      "notifyGpsAcceptedPosition",
      "RoadLiability",
      "Salik",
      "tryAcquireGpsProviderSyncLease",
      ".create(",
      ".update(",
      ".upsert(",
      ".delete(",
      "sendCommand",
      "immobil",
      "cutoff",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });
});
